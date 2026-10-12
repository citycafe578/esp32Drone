"""電腦 <-> 地面站 的連線層。

兩種後端，介面相同：
  WifiLink   : 連到地面站 ESP32 的 SoftAP (Drone_GCS_Relay)，用 WebSocket 送控制、
               用 HTTP /arm /kill 解鎖與鎖定。與 hardware/ground 現有韌體相容。
  SerialLink : USB 序列埠 (舊版 ComData 封包)，保留給未來韌體。

兩者都會把收到的文字行交給 on_text()，供遙測 (Geohash / GPS) 解析。
"""
from __future__ import annotations

import threading
import time
import urllib.error
import urllib.request
from typing import Callable, Optional

import protocol

try:
    import websocket  # pip install websocket-client
except ImportError:  # pragma: no cover
    websocket = None

try:
    import serial  # pip install pyserial
except ImportError:  # pragma: no cover
    serial = None


class BaseLink:
    mode = 'none'

    def __init__(self, on_text: Callable[[str], None]):
        self._on_text = on_text
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self.connected = False
        self.detail = ''

    def start(self) -> None:
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, daemon=True, name=f'{self.mode}-link')
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive() and self._thread is not threading.current_thread():
            self._thread.join(timeout=2)
        self._close()
        self.connected = False

    def status(self) -> dict:
        return {'mode': self.mode, 'connected': self.connected, 'detail': self.detail}

    # 子類別實作
    def _run(self) -> None: ...
    def _close(self) -> None: ...
    def send_control(self, st: protocol.ControlState, armed: bool) -> bool: return False
    def arm(self) -> bool: return False
    def kill(self) -> bool: return False


class NullLink(BaseLink):
    mode = 'none'

    def __init__(self, on_text=lambda s: None, detail='未設定連線'):
        super().__init__(on_text)
        self.detail = detail

    def start(self) -> None: ...
    def stop(self) -> None: ...


class WifiLink(BaseLink):
    mode = 'wifi'

    def __init__(self, on_text, host: str):
        super().__init__(on_text)
        # 支援 "host" 或 "host:httpPort"；WebSocket 埠固定為 HTTP 埠 + 1 (地面站韌體: 80 / 81)
        name, _, port = host.partition(':')
        self.host = host
        self._name = name
        self._http_port = int(port) if port.isdigit() else 80
        self._ws_port = self._http_port + 1
        self._ws = None
        self._send_lock = threading.Lock()

    def _run(self) -> None:
        if websocket is None:
            self.detail = '缺少套件：pip install websocket-client'
            return
        while not self._stop.is_set():
            try:
                self.detail = f'連線中 {self.host}'
                ws = websocket.create_connection(f'ws://{self._name}:{self._ws_port}/', timeout=3)
                ws.settimeout(0.5)
                self._ws = ws
                self.connected = True
                self.detail = f'已連線 {self.host}'
                self._recv_loop(ws)
            except Exception as e:  # noqa: BLE001
                self.detail = f'連線失敗：{e}'
            finally:
                self.connected = False
                self._close()
            self._stop.wait(1.0)

    def _recv_loop(self, ws) -> None:
        while not self._stop.is_set():
            try:
                msg = ws.recv()
            except websocket.WebSocketTimeoutException:
                continue
            if msg is None or msg == '':
                if not getattr(ws, 'connected', True):
                    return
                continue
            if isinstance(msg, (bytes, bytearray)):
                msg = bytes(msg).decode('utf-8', errors='ignore')
            for line in str(msg).splitlines():
                self._on_text(line)

    def _close(self) -> None:
        ws, self._ws = self._ws, None
        if ws is not None:
            try:
                ws.close()
            except Exception:  # noqa: BLE001
                pass

    def send_control(self, st, armed) -> bool:
        ws = self._ws
        if ws is None or not self.connected:
            return False
        try:
            with self._send_lock:
                ws.send_binary(protocol.pack_wifi(st))
            return True
        except Exception as e:  # noqa: BLE001
            self.connected = False
            self.detail = f'傳送失敗：{e}'
            return False

    def _http(self, path: str, retries: int = 1) -> bool:
        for _ in range(retries):
            try:
                with urllib.request.urlopen(f'http://{self._name}:{self._http_port}{path}', timeout=1.5) as r:
                    if 200 <= r.status < 300:
                        return True
            except (urllib.error.URLError, OSError):
                pass
        return False

    def arm(self) -> bool:
        return self._http('/arm')

    def kill(self) -> bool:
        # 鎖定很重要，多試幾次
        return self._http('/kill', retries=3)


class SerialLink(BaseLink):
    mode = 'serial'

    def __init__(self, on_text, port: str):
        super().__init__(on_text)
        self.port = port
        self._ser = None
        self._lock = threading.Lock()

    def _run(self) -> None:
        if serial is None:
            self.detail = '缺少套件：pip install pyserial'
            return
        while not self._stop.is_set():
            try:
                self.detail = f'開啟 {self.port}'
                ser = serial.Serial(self.port, 115200, timeout=0.05)
                self._stop.wait(1.5)  # 等 ESP32 重開機完成
                ser.reset_input_buffer()
                self._ser = ser
                self.connected = True
                self.detail = f'已連線 {self.port}'
                while not self._stop.is_set():
                    line = ser.readline()
                    if line:
                        self._on_text(line.decode('utf-8', errors='ignore').strip())
            except Exception as e:  # noqa: BLE001
                self.detail = f'序列埠錯誤：{e}'
            finally:
                self.connected = False
                self._close()
            self._stop.wait(1.0)

    def _close(self) -> None:
        with self._lock:
            ser, self._ser = self._ser, None
        if ser is not None:
            try:
                ser.close()
            except Exception:  # noqa: BLE001
                pass

    def send_control(self, st, armed) -> bool:
        ser = self._ser
        if ser is None or not self.connected:
            return False
        try:
            with self._lock:
                ser.write(protocol.pack_serial(st, armed))
            return True
        except Exception as e:  # noqa: BLE001
            self.connected = False
            self.detail = f'傳送失敗：{e}'
            return False

    # 序列封包本身就帶著 start_up / emergency_stop，不需要額外指令
    def arm(self) -> bool:
        return self.connected

    def kill(self) -> bool:
        return self.connected


class LinkManager:
    """持有目前的連線，可在執行中切換模式 / 目標。"""

    def __init__(self, on_text: Callable[[str], None]):
        self._on_text = on_text
        self._lock = threading.Lock()
        self._link: BaseLink = NullLink(on_text)
        self._key: tuple = ('none',)

    def configure(self, mode: str, host: str = '', port: str = '') -> dict:
        key = (mode, host if mode == 'wifi' else port)
        with self._lock:
            if key == self._key:
                return self._link.status()
            self._link.stop()
            if mode == 'wifi' and host:
                self._link = WifiLink(self._on_text, host)
            elif mode == 'serial' and port:
                self._link = SerialLink(self._on_text, port)
            else:
                self._link = NullLink(self._on_text, '未選擇序列埠' if mode == 'serial' else '未設定連線')
            self._key = key
            self._link.start()
            return self._link.status()

    @property
    def link(self) -> BaseLink:
        return self._link

    def status(self) -> dict:
        return self._link.status()
