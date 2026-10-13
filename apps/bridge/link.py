"""電腦 <-> 地面站 的連線層。

兩種後端，介面相同：
  WifiLink   : 連到地面站 ESP32 的 SoftAP (Drone_GCS_Relay)，用 WebSocket 送控制、
               用 HTTP /arm /kill 解鎖與鎖定。與 hardware/ground 現有韌體相容。
  SerialLink : USB 序列埠 (二進位幀 + CRC，見 protocol.py)。地面站同時回傳 STATUS / GEO / PID 文字行。

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
        # 地面站回報的狀態 / PID (兩種連線方式共用同一套文字行)
        self._vitals: dict = {}
        self._vitals_at = 0.0
        self._pid: dict = {}
        self._pid_cv = threading.Condition()

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
        st = {'mode': self.mode, 'connected': self.connected, 'detail': self.detail}
        v = self._vitals
        if self.connected and v:
            age = v.get('drone_rx_age_ms')
            if age is not None:
                age += int((time.monotonic() - self._vitals_at) * 1000)
            st.update({
                'ground_armed': v['ground_armed'],
                'drone_rx_age_ms': age,
                'drone_armed': v['drone_armed'],
                'roll': v['roll'], 'pitch': v['pitch'], 'battery': v['battery'],
                'drone_calibrating': v['drone_calibrating'],
                'mpu_calibrated': v['mpu_calibrated'],
            })
        return st

    def _handle_line(self, line: str) -> None:
        """地面站送來的一行文字：STATUS / PID 在這裡處理，其餘 (GEO 等遙測) 交給 on_text。"""
        if line.startswith('STATUS,'):
            v = protocol.parse_status(line)
            if v:
                self._vitals = v
                self._vitals_at = time.monotonic()
        elif line.startswith('PID,'):
            parsed = protocol.parse_pid_line(line)
            if parsed:
                with self._pid_cv:
                    self._pid[parsed[0]] = parsed[1]
                    self._pid_cv.notify_all()
        elif line:
            self._on_text(line)

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
                self._handle_line(line.strip())

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

    def http_get(self, path: str, timeout: float = 2.0) -> Optional[str]:
        """對地面站發 HTTP GET，成功回傳內容，失敗回傳 None。"""
        try:
            with urllib.request.urlopen(f'http://{self._name}:{self._http_port}{path}', timeout=timeout) as r:
                if 200 <= r.status < 300:
                    return r.read().decode('utf-8', errors='replace')
        except (urllib.error.URLError, OSError):
            pass
        return None

    def _http(self, path: str, retries: int = 1) -> bool:
        return any(self.http_get(path, timeout=1.5) is not None for _ in range(retries))

    def arm(self) -> bool:
        return self._http('/arm')

    def kill(self) -> bool:
        # 鎖定很重要，多試幾次
        return self._http('/kill', retries=3)


class SerialLink(BaseLink):
    """電腦 <-> 地面站 ESP32 (USB 序列)。地面站是「已解鎖」狀態的唯一依據：
    ARM / KILL 以 CONTROL 幀的 cmd 欄位送出，並以地面站回傳的 STATUS 確認。"""

    mode = 'serial'
    STATUS_TIMEOUT_S = 3.0

    def __init__(self, on_text, port: str):
        self._port_open = False
        self._vitals_at = 0.0
        super().__init__(on_text)
        self.port = port
        self._ser = None
        self._lock = threading.Lock()

    # 「已連線」= 序列埠已開啟，而且地面站有在回 STATUS (舊韌體不會回，所以不會誤判成可用)
    @property
    def connected(self) -> bool:
        return self._port_open and (time.monotonic() - self._vitals_at) < self.STATUS_TIMEOUT_S

    @connected.setter
    def connected(self, value: bool) -> None:
        self._port_open = bool(value)

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
                self._port_open = True
                while not self._stop.is_set():
                    raw = ser.readline()
                    if raw:
                        self._handle_line(raw.decode('utf-8', errors='ignore').strip())
            except Exception as e:  # noqa: BLE001
                # Windows 的 pyserial 會把「沒有這個 COM 埠」包成 SerialException，訊息裡才有 FileNotFoundError
                if isinstance(e, FileNotFoundError) or 'FileNotFoundError' in str(e):
                    self.detail = f'找不到 {self.port}，請確認地面站已接上，或到設定重新選擇序列埠'
                else:
                    self.detail = f'序列埠錯誤：{e}'
            finally:
                self._port_open = False
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

    def _write(self, data: bytes) -> bool:
        ser = self._ser
        if ser is None or not self._port_open:
            return False
        try:
            with self._lock:
                ser.write(data)
            return True
        except Exception as e:  # noqa: BLE001
            self._port_open = False
            self.detail = f'傳送失敗：{e}'
            return False

    def _wait(self, predicate, timeout: float) -> bool:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if predicate():
                return True
            time.sleep(0.02)
        return predicate()

    # ── 上行 ──────────────────────────────────────────────────────
    def send_control(self, st, armed) -> bool:
        return self._write(protocol.pack_control_frame(st))

    def send_command(self, cmd: int, repeat: int = 1) -> bool:
        ok = True
        for n in range(repeat):
            ok = self._write(protocol.pack_control_frame(protocol.ControlState.neutral(), cmd)) and ok
            if n + 1 < repeat:
                time.sleep(0.02)
        return ok

    def arm(self) -> bool:
        sent_at = time.monotonic()
        if not self.send_command(protocol.CMD_ARM):
            return False
        # 等地面站下一筆 STATUS 回報「已解鎖」
        return self._wait(lambda: self._vitals_at > sent_at and self._vitals.get('ground_armed') is True, 1.5)

    def kill(self) -> bool:
        return self.send_command(protocol.CMD_KILL, repeat=3)

    def send_tune(self, axis: str, p: float, i: float, d: float) -> bool:
        return self._write(protocol.pack_tune_frame(axis, p, i, d))

    def request_pid(self, timeout: float = 1.5) -> dict:
        with self._pid_cv:
            self._pid.clear()
        if not self._write(protocol.pack_get_pid_frame()):
            return {}
        deadline = time.monotonic() + timeout
        with self._pid_cv:
            while len(self._pid) < 5 and time.monotonic() < deadline:
                self._pid_cv.wait(max(0.0, deadline - time.monotonic()))
            return dict(self._pid)

    # ── 狀態 ──────────────────────────────────────────────────────
    def status(self) -> dict:
        st = super().status()
        if self._port_open and not self.connected:
            st['detail'] = f'已開啟 {self.port}，但地面站沒有回應 (請確認接的是 ground ESP32 且韌體已更新)'
        elif self.connected:
            st['detail'] = f'已連線 {self.port}'
        return st


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
