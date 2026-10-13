"""遙測中心：接收 Geohash / GPS 資料 -> 解碼成經緯度 -> 推送給前端 + 錄製飛行軌跡。"""
from __future__ import annotations

import json
import os
import re
import threading
import time
from collections import deque
from datetime import datetime
from typing import Any, Callable, Optional

import geohash
from geo import bearing, haversine
from protocol import parse_telemetry

_FLIGHT_ID = re.compile(r'^flight_\d{8}_\d{6}$')
MIN_MOVE_FOR_COURSE_M = 1.5      # 少於這個距離不用位移推算航向 (GPS 抖動)
REC_INTERVAL_S = 0.5             # 錄製頻率上限 2Hz
REC_IDLE_CLOSE_S = 10.0          # 超過這麼久沒資料就結束一次飛行紀錄


class TelemetryHub:
    def __init__(self, emit: Callable[[str, dict], None], flights_dir: str):
        self._emit = emit
        self._dir = flights_dir
        self._lock = threading.RLock()
        self.latest: Optional[dict[str, Any]] = None
        self.home: Optional[dict[str, float]] = None
        self._last_heading: Optional[float] = None
        self._prev_pos: Optional[tuple[float, float]] = None
        self._rec: list[dict[str, Any]] = []
        self._rec_start = 0.0
        self._rec_last = 0.0
        self._last_rx = 0.0
        self.trail: deque[tuple[float, float]] = deque(maxlen=2000)
        threading.Thread(target=self._watchdog, daemon=True, name='telemetry-watchdog').start()

    # ── 輸入 ──────────────────────────────────────────────────────
    def ingest_text(self, line: str) -> Optional[dict]:
        sample = parse_telemetry(line)
        return self.ingest(sample) if sample else None

    def ingest(self, raw: Any) -> Optional[dict]:
        sample = parse_telemetry(raw)
        if not sample:
            return None
        with self._lock:
            return self._ingest_locked(sample)

    def _ingest_locked(self, s: dict[str, Any]) -> Optional[dict]:
        now = time.time()
        gh = s.get('geohash')
        accuracy = None
        if gh:
            lat, lng, lat_err, lon_err = geohash.decode_exactly(gh)
            accuracy = round(geohash.error_meters(lat, lat_err, lon_err), 2)
        elif s.get('lat') is not None:
            lat, lng = s['lat'], s['lng']
        else:
            return None

        # 航向：優先使用飛機回報的；沒有就用連續兩點的位移方向推算
        heading, source = s.get('heading'), 'sensor'
        if heading is None:
            source = 'gps'
            if self._prev_pos is not None:
                d = haversine(self._prev_pos[0], self._prev_pos[1], lat, lng)
                if d >= MIN_MOVE_FOR_COURSE_M:
                    self._last_heading = bearing(self._prev_pos[0], self._prev_pos[1], lat, lng)
                    self._prev_pos = (lat, lng)
            else:
                self._prev_pos = (lat, lng)
            heading = self._last_heading
        else:
            self._last_heading = heading
            self._prev_pos = (lat, lng)

        if self.home is None:
            self.home = {'lat': lat, 'lng': lng}
        dist_home = round(haversine(self.home['lat'], self.home['lng'], lat, lng), 1)

        payload = {
            'ts': now,
            'geohash': gh or geohash.encode(lat, lng, 9),
            'lat': lat, 'lng': lng, 'accuracy_m': accuracy,
            'heading': None if heading is None else round(heading, 1),
            'heading_source': source if heading is not None else None,
            'alt': s.get('alt'), 'speed': s.get('speed'),
            'battery': s.get('battery'), 'sats': s.get('sats'),
            'home': dict(self.home), 'distance_home': dist_home,
        }
        self.latest = payload
        self._last_rx = now
        if not self.trail or haversine(self.trail[-1][0], self.trail[-1][1], lat, lng) >= 0.5:
            self.trail.append((lat, lng))
        self._record(payload)
        self._emit('telemetry', payload)
        return payload

    # ── 家 / 軌跡 ─────────────────────────────────────────────────
    def set_home(self, lat: float, lng: float) -> dict:
        with self._lock:
            self.home = {'lat': float(lat), 'lng': float(lng)}
            return dict(self.home)

    def set_home_here(self) -> Optional[dict]:
        with self._lock:
            if self.latest is None:
                return None
            return self.set_home(self.latest['lat'], self.latest['lng'])

    def clear_trail(self) -> None:
        with self._lock:
            self.trail.clear()

    def clear_map(self) -> None:
        """清除地圖資料：軌跡與起飛點 (下一筆定位會重新以當下位置為起飛點)。"""
        with self._lock:
            self.trail.clear()
            self.home = None

    # ── 飛行紀錄 ──────────────────────────────────────────────────
    def _record(self, p: dict[str, Any]) -> None:
        if not self._rec:
            self._rec_start = p['ts']
            self._rec_last = 0.0
        if p['ts'] - self._rec_last < REC_INTERVAL_S:
            return
        self._rec_last = p['ts']
        self._rec.append({
            't': round(p['ts'] - self._rec_start, 2),
            'lat': p['lat'], 'lng': p['lng'], 'alt': p['alt'],
            'heading': p['heading'], 'speed': p['speed'],
        })

    def _watchdog(self) -> None:
        while True:
            time.sleep(1.0)
            with self._lock:
                if self._rec and time.time() - self._last_rx > REC_IDLE_CLOSE_S:
                    self.flush_recording()

    def flush_recording(self) -> Optional[str]:
        with self._lock:
            rec, self._rec = self._rec, []
            if len(rec) < 2:
                return None
            dist = sum(haversine(a['lat'], a['lng'], b['lat'], b['lng']) for a, b in zip(rec, rec[1:]))
            alts = [r['alt'] for r in rec if r['alt'] is not None]
            home = self.home or {'lat': rec[0]['lat'], 'lng': rec[0]['lng']}
            fid = datetime.fromtimestamp(self._rec_start).strftime('flight_%Y%m%d_%H%M%S')
            doc = {
                'id': fid,
                'start': self._rec_start,
                'duration_s': rec[-1]['t'],
                'distance_m': round(dist, 1),
                'max_alt_m': max(alts) if alts else None,
                'max_dist_home_m': round(max(haversine(home['lat'], home['lng'], r['lat'], r['lng']) for r in rec), 1),
                'points': rec,
            }
            os.makedirs(self._dir, exist_ok=True)
            path = os.path.join(self._dir, fid + '.json')
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(doc, f)
            self._prev_pos = None
            print(f'[flight] 已儲存 {fid} ({len(rec)} 點, {dist:.0f} m)')
            return fid

    def list_flights(self) -> list[dict]:
        out = []
        if not os.path.isdir(self._dir):
            return out
        for name in sorted(os.listdir(self._dir), reverse=True):
            fid = name[:-5]
            if not name.endswith('.json') or not _FLIGHT_ID.match(fid):
                continue
            try:
                with open(os.path.join(self._dir, name), 'r', encoding='utf-8') as f:
                    d = json.load(f)
                d.pop('points', None)
                out.append(d)
            except (OSError, json.JSONDecodeError):
                continue
        return out

    def get_flight(self, fid: str) -> Optional[dict]:
        if not _FLIGHT_ID.match(fid):
            return None
        try:
            with open(os.path.join(self._dir, fid + '.json'), 'r', encoding='utf-8') as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError):
            return None

    def delete_flight(self, fid: str) -> bool:
        if not _FLIGHT_ID.match(fid):
            return False
        try:
            os.remove(os.path.join(self._dir, fid + '.json'))
            return True
        except OSError:
            return False
