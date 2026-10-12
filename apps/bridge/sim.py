"""GPS 模擬器：沒有實機時用來測試地圖 (置中 / 旋轉 / 軌跡)。

走的是真正的接收路徑：產生 Geohash 字串 -> TelemetryHub.ingest()。
"""
from __future__ import annotations

import math
import threading
import time

import geohash


class Simulator:
    def __init__(self, hub, center=(25.0330, 121.5654), radius_m=60.0, speed_mps=4.0, hz=5.0):
        self.hub = hub
        self.center = center
        self.radius = radius_m
        self.speed = speed_mps
        self.period = 1.0 / hz
        self._stop = threading.Event()
        self._thread = None

    @property
    def running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def start(self) -> None:
        if self.running:
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, daemon=True, name='gps-sim')
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _run(self) -> None:
        lat0, lng0 = self.center
        m_per_deg_lat = 111_320.0
        m_per_deg_lng = 111_320.0 * math.cos(math.radians(lat0))
        w = self.speed / self.radius  # rad/s
        t0 = time.time()
        while not self._stop.is_set():
            t = time.time() - t0
            th = w * t
            lat = lat0 + (self.radius * math.sin(th)) / m_per_deg_lat
            lng = lng0 + (self.radius * math.cos(th) - self.radius) / m_per_deg_lng
            # 切線方向的方位角 (0=北, 順時針)
            heading = (math.degrees(math.atan2(-math.sin(th), math.cos(th))) + 360) % 360
            self.hub.ingest({
                'geohash': geohash.encode(lat, lng, 9),
                'heading': round(heading, 1),
                'alt': round(5 + 2 * math.sin(t / 5), 2),
                'speed': self.speed,
                'battery': round(max(9.0, 12.4 - t * 0.002), 2),
                'sats': 9,
            })
            self._stop.wait(self.period)
