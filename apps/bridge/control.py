"""控制工作階段：把前端的搖桿訊號轉成穩定的上行封包，並負責軟體端安全邏輯。

* 以固定頻率 (預設 25Hz) 送出最新狀態，與前端送訊號的頻率脫鉤。
* 解鎖前油門必須在最低點；按下緊急停止立即鎖定。
* 控制訊號中斷 (瀏覽器關閉 / 搖桿拔除 / 網路斷線) 時自動鎖定並送中立值。
"""
from __future__ import annotations

import threading
import time
from typing import Callable

import protocol
from link import LinkManager

STALE_AFTER_S = 0.5


class ControlSession:
    def __init__(self, links: LinkManager, emit: Callable[[str, dict], None], rate_hz: float = 25.0):
        self._links = links
        self._emit = emit
        self._period = 1.0 / rate_hz
        self._lock = threading.Lock()
        self._state = protocol.ControlState.neutral()
        self._last_signal = 0.0
        self._prev_start = 0
        self._prev_estop = 0
        self.armed = False
        self._armed_at = 0.0
        self._last_report = 0.0
        self._last_reported_armed: bool | None = None
        threading.Thread(target=self._loop, daemon=True, name='control-loop').start()

    # ── 來自前端 ───────────────────────────────────────────────────
    def update(self, signal: dict) -> None:
        st = protocol.ControlState.from_signal(signal or {})
        with self._lock:
            self._state = st
            self._last_signal = time.monotonic()
            start_edge = st.start_up and not self._prev_start
            estop_edge = st.emergency_stop and not self._prev_estop
            self._prev_start, self._prev_estop = st.start_up, st.emergency_stop

        if estop_edge:
            self._disarm('緊急停止', level='warning')
        elif start_edge and not self.armed:
            self._try_arm(st)

    def _try_arm(self, st: protocol.ControlState) -> None:
        link = self._links.link
        if not link.connected:
            self._alert('無法解鎖：尚未連線到地面站', 'error')
        elif st.throttle > protocol.ARM_MAX_THROTTLE:
            self._alert('無法解鎖：請先把油門拉到最低', 'error')
        elif link.arm():
            self.armed = True
            self._armed_at = time.monotonic()
            self._alert('已解鎖 (ARMED)', 'info')
            self._report(force=True)
        else:
            self._alert('解鎖失敗：地面站沒有回應', 'error')

    def _disarm(self, reason: str, level: str = 'warning') -> None:
        was_armed = self.armed
        self.armed = False
        ok = self._links.link.kill() if self._links.link.connected else False
        if was_armed or not ok:
            suffix = '' if ok else ' (⚠ 地面站沒有回應，請確認飛機已斷電)'
            self._alert(f'已鎖定：{reason}{suffix}', level if ok else 'error')
        self._report(force=True)

    # ── 週期性輸出 ─────────────────────────────────────────────────
    def _loop(self) -> None:
        while True:
            t0 = time.monotonic()
            try:
                self._tick(t0)
            except Exception as e:  # noqa: BLE001
                print(f'[control] {e}')
            time.sleep(max(0.0, self._period - (time.monotonic() - t0)))

    def _tick(self, now: float) -> None:
        with self._lock:
            fresh = (now - self._last_signal) <= STALE_AFTER_S
            st = self._state if fresh else protocol.ControlState.neutral()
        if not fresh and self.armed:
            self._disarm('控制訊號中斷', level='error')
        link = self._links.link
        # 地面站自己鎖定了 (失聯保護 / 另一個控制端按了 KILL)：同步，不要繼續以為已解鎖
        if self.armed and now - self._armed_at > 1.5 and link.status().get('ground_armed') is False:
            self.armed = False
            self._alert('地面站已鎖定', 'warning')
            self._report(force=True)
        if link.connected:
            link.send_control(st, self.armed)
        self._report()

    def _report(self, force: bool = False) -> None:
        now = time.monotonic()
        if force or now - self._last_report >= 0.5 or self._last_reported_armed != self.armed:
            self._last_report = now
            self._last_reported_armed = self.armed
            self._emit('control_state', {'armed': self.armed, 'link': self._links.status()})

    def _alert(self, message: str, level: str = 'info') -> None:
        print(f'[alert:{level}] {message}')
        self._emit('alert', {'level': level, 'message': message, 'ts': time.time()})

    def status(self) -> dict:
        return {'armed': self.armed, 'link': self._links.status()}
