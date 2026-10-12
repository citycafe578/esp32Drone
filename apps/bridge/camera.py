"""相機管理：單一擷取執行緒 + 影像處理 (翻轉 / 銳化 / 灰階) + MJPEG 串流。

* 只有一個執行緒讀相機，多個瀏覽器分頁同時看也不會搶裝置。
* 設定值從記憶體讀取 (configs)，不再每一幀開檔。
"""
from __future__ import annotations

import os
import threading
import time
from typing import Iterator, Optional

import configs

try:
    import cv2
except ImportError:  # pragma: no cover
    cv2 = None


def _int(v, default=0) -> int:
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return default


class CameraManager:
    def __init__(self):
        self._cap = None
        self._index: Optional[int] = None
        self._want_index = 0
        self._paused = False
        self._lock = threading.Lock()
        self._cond = threading.Condition()
        self._frame: Optional[bytes] = None
        self._frame_id = 0
        self._cameras_cache: tuple[float, list[int]] = (0.0, [])
        self.available = cv2 is not None
        if self.available:
            threading.Thread(target=self._loop, daemon=True, name='camera').start()

    # ── 控制 ──────────────────────────────────────────────────────
    def set_index(self, idx: int) -> None:
        self._want_index = idx

    def pause(self) -> None:
        self._paused = True

    def resume(self) -> None:
        self._paused = False

    @property
    def paused(self) -> bool:
        return self._paused

    def status(self) -> dict:
        return {
            'available': self.available,
            'index': self._index,
            'opened': bool(self._cap is not None and self._cap.isOpened()),
            'paused': self._paused,
        }

    def list_cameras(self, refresh: bool = False, max_index: int = 5) -> list[int]:
        if not self.available:
            return []
        ts, cached = self._cameras_cache
        if cached and not refresh and time.time() - ts < 15:
            return cached
        found = []
        for i in range(max_index + 1):
            if i == self._index and self._cap is not None and self._cap.isOpened():
                found.append(i)
                continue
            cap = self._open(i)
            if cap.isOpened():
                found.append(i)
            cap.release()
        self._cameras_cache = (time.time(), found)
        return found

    # ── 內部 ──────────────────────────────────────────────────────
    @staticmethod
    def _open(idx: int):
        if os.name == 'nt':
            return cv2.VideoCapture(idx, cv2.CAP_DSHOW)
        return cv2.VideoCapture(idx)

    def _ensure_open(self) -> bool:
        if self._cap is not None and self._index == self._want_index and self._cap.isOpened():
            return True
        if self._cap is not None:
            self._cap.release()
            self._cap = None
        cap = self._open(self._want_index)
        self._index = self._want_index
        if not cap.isOpened():
            cap.release()
            return False
        self._cap = cap
        print(f'[camera] opened index {self._want_index}')
        return True

    def _process(self, frame):
        drone = configs.get_section('droneSettings')
        other = configs.get_section('otherSettings')
        h = configs.flag(drone, 'imageHorizontalFlip')
        v = configs.flag(drone, 'imageVerticalFlip')
        if h and v:
            frame = cv2.flip(frame, -1)
        elif h:
            frame = cv2.flip(frame, 1)
        elif v:
            frame = cv2.flip(frame, 0)

        sharpen = max(0, min(100, _int(other.get('sharpen')))) / 100.0
        if sharpen > 0:
            blur = cv2.GaussianBlur(frame, (0, 0), 1.5)
            frame = cv2.addWeighted(frame, 1 + sharpen, blur, -sharpen, 0)

        gray = max(0, min(100, _int(other.get('grayscale')))) / 100.0
        if gray > 0:
            g3 = cv2.cvtColor(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
            frame = cv2.addWeighted(frame, 1 - gray, g3, gray, 0)
        return frame

    def _loop(self) -> None:
        failures = 0
        while True:
            if self._paused:
                if self._cap is not None:       # 暫停時釋放裝置，讓別的程式可用
                    self._cap.release()
                    self._cap = None
                time.sleep(0.2)
                continue
            try:
                if not self._ensure_open():
                    time.sleep(1.0)
                    continue
                ok, frame = self._cap.read()
                if not ok:
                    failures += 1
                    if failures > 30:           # 裝置掉了，重新開
                        self._cap.release()
                        self._cap = None
                        failures = 0
                    time.sleep(0.05)
                    continue
                failures = 0
                ok, buf = cv2.imencode('.jpg', self._process(frame), [cv2.IMWRITE_JPEG_QUALITY, 80])
                if ok:
                    with self._cond:
                        self._frame = buf.tobytes()
                        self._frame_id += 1
                        self._cond.notify_all()
            except Exception as e:  # noqa: BLE001
                print(f'[camera] {e}')
                time.sleep(0.5)

    def frames(self) -> Iterator[bytes]:
        last = -1
        while True:
            with self._cond:
                self._cond.wait_for(lambda: self._frame_id != last, timeout=1.0)
                if self._frame_id == last or self._frame is None:
                    continue
                last = self._frame_id
                jpg = self._frame
            yield b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + jpg + b'\r\n'
