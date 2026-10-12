"""控制封包 / 遙測封包的格式定義 (前後端與韌體之間的約定集中在這裡)。

【上行：電腦 -> 地面站】
  wifi   : WebSocket (ws://<地面站>:81/) 二進位 10 bytes，小端：
           uint16 throttle, int16 roll, int16 pitch, int16 yaw, int16 保留(0)
           這與 hardware/ground 現有韌體 (手機網頁用的格式) 完全一致。
           解鎖 / 鎖定走 HTTP GET /arm、/kill。
  serial : 舊版 USB 序列封包 (ComData)，保留給未來韌體使用。

【下行：地面站 / 飛機 -> 電腦】 (遙測，每行一筆，文字)
  1. JSON : {"geohash":"wsqqqxy1k","heading":123.4,"alt":1.8,"speed":0.6,"battery":11.7,"sats":9}
  2. CSV  : GEO,<geohash>[,heading[,alt[,speed[,battery[,sats]]]]]   (空欄位表示沒有資料)
  3. 純文字 geohash : wsqqqxy1k
  單位：heading=度(0=北,順時針)、alt=公尺、speed=公尺/秒、battery=伏特。
"""
from __future__ import annotations

import json
import re
import struct
from dataclasses import dataclass
from typing import Any, Optional

from geohash import is_valid as geohash_is_valid

NEUTRAL = 1500
THROTTLE_MIN = 1000
RC_MIN, RC_MAX = 1000, 2000
ARM_MAX_THROTTLE = 1050  # 解鎖前油門必須在最低點


def _clamp(v: Any, lo: int, hi: int, default: int) -> int:
    try:
        return max(lo, min(hi, int(round(float(v)))))
    except (TypeError, ValueError):
        return default


@dataclass
class ControlState:
    throttle: int = THROTTLE_MIN
    pitch: int = NEUTRAL
    yaw: int = NEUTRAL
    roll: int = NEUTRAL
    emergency_stop: int = 0
    start_up: int = 0
    speed_mode: int = 0
    obstacle_avoidance: int = 0
    still_dont_know: int = 0

    @classmethod
    def from_signal(cls, s: dict[str, Any]) -> 'ControlState':
        return cls(
            throttle=_clamp(s.get('throttle'), RC_MIN, RC_MAX, THROTTLE_MIN),
            pitch=_clamp(s.get('pitch'), RC_MIN, RC_MAX, NEUTRAL),
            yaw=_clamp(s.get('yaw'), RC_MIN, RC_MAX, NEUTRAL),
            roll=_clamp(s.get('roll'), RC_MIN, RC_MAX, NEUTRAL),
            emergency_stop=1 if s.get('emergency_stop') else 0,
            start_up=1 if s.get('start_up') else 0,
            speed_mode=1 if s.get('speed_mode') else 0,
            obstacle_avoidance=1 if s.get('obstacle_avoidance') else 0,
            still_dont_know=1 if s.get('still_dont_know') else 0,
        )

    @classmethod
    def neutral(cls) -> 'ControlState':
        return cls()


def pack_wifi(st: ControlState) -> bytes:
    """地面站 WebSocket 封包 (10 bytes)。"""
    return struct.pack('<Hhhhh', st.throttle, st.roll, st.pitch, st.yaw, 0)


def pack_serial(st: ControlState, armed: bool) -> bytes:
    """舊版序列封包：0xAA, 0x01, 9 個 int16。"""
    return struct.pack(
        '<BBhhhhhhhhh', 0xAA, 0x01,
        st.throttle, st.pitch, st.yaw, st.roll,
        1 if st.emergency_stop else 0,
        1 if armed else 0,
        st.speed_mode, st.obstacle_avoidance, st.still_dont_know,
    )


# ── 遙測解析 ────────────────────────────────────────────────────────────────

_GEO_LINE = re.compile(r'^\$?GEO[:,]\s*(.*)$', re.IGNORECASE)
_BARE_GEOHASH = re.compile(r'^[0-9b-hjkmnp-z]{5,12}$', re.IGNORECASE)

_ALIASES = {
    'geohash': ('geohash', 'gh', 'geo'),
    'heading': ('heading', 'hdg', 'course', 'yaw'),
    'alt': ('alt', 'altitude', 'height'),
    'speed': ('speed', 'spd'),
    'battery': ('battery', 'bat', 'vbat'),
    'sats': ('sats', 'satellites'),
    'lat': ('lat', 'latitude'),
    'lng': ('lng', 'lon', 'longitude'),
}


def _num(v: Any) -> Optional[float]:
    if v is None or v == '':
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f and abs(f) != float('inf') else None


def _from_dict(d: dict[str, Any]) -> Optional[dict[str, Any]]:
    lowered = {str(k).lower(): v for k, v in d.items()}
    out: dict[str, Any] = {}
    for canon, names in _ALIASES.items():
        for n in names:
            if n in lowered and lowered[n] not in (None, ''):
                out[canon] = lowered[n]
                break
    gh = out.get('geohash')
    out['geohash'] = gh.strip().lower() if isinstance(gh, str) and geohash_is_valid(gh.strip()) else None
    for k in ('heading', 'alt', 'speed', 'battery', 'lat', 'lng'):
        out[k] = _num(out.get(k))
    sats = _num(out.get('sats'))
    out['sats'] = int(sats) if sats is not None else None
    if out['heading'] is not None:
        out['heading'] = out['heading'] % 360.0
    has_ll = out['lat'] is not None and out['lng'] is not None \
        and -90 <= out['lat'] <= 90 and -180 <= out['lng'] <= 180
    if out['geohash'] is None and not has_ll:
        return None
    if not has_ll:
        out['lat'] = out['lng'] = None
    return out


def parse_telemetry(raw: Any) -> Optional[dict[str, Any]]:
    """解析一筆遙測 (str / bytes / dict)。無法解析時回傳 None。"""
    if isinstance(raw, (bytes, bytearray)):
        raw = bytes(raw).decode('utf-8', errors='ignore')
    if isinstance(raw, dict):
        return _from_dict(raw)
    if not isinstance(raw, str):
        return None
    line = raw.strip()
    if not line:
        return None
    if line.startswith('{'):
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            return None
        return _from_dict(obj) if isinstance(obj, dict) else None
    m = _GEO_LINE.match(line)
    if m:
        parts = [p.strip() for p in m.group(1).split(',')]
        keys = ('geohash', 'heading', 'alt', 'speed', 'battery', 'sats')
        return _from_dict({k: v for k, v in zip(keys, parts)})
    if _BARE_GEOHASH.match(line):
        return _from_dict({'geohash': line})
    return None
