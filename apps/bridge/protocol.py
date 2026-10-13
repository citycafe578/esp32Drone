"""控制封包 / 遙測文字的格式定義 (電腦、地面站、飛機之間的約定集中在這裡)。

整體鏈路：電腦 --(USB 序列 或 Wi‑Fi)--> 地面站 ESP32 --(ESP-NOW)--> 飛機 ESP32

【上行：電腦 -> 地面站】
  serial (預設) : 二進位幀  0xA5 0x5A | type | len | payload | crc8
                  type 0x01 CONTROL (throttle,roll,pitch,yaw,cmd) / 0x02 TUNE / 0x03 GET_PID
                  C++ 實作在 hardware/ground/serial_link.h，兩邊由 tests/test_firmware_protocol.py 互相驗證。
  wifi          : WebSocket (ws://<地面站>:81/) 二進位 10 bytes，小端：
                  uint16 throttle, int16 roll, int16 pitch, int16 yaw, int16 保留(0)
                  這是地面站手機網頁用的格式；解鎖 / 鎖定走 HTTP GET /arm、/kill。

【下行：地面站 -> 電腦】 (文字，每行一筆，serial 與 wifi 相同)
  GEO,<geohash>,<heading>,<alt m>,<speed m/s>,<battery V>,<sats>   位置 (見下方 parse_telemetry)
  STATUS,<地面站已解鎖>,<距上次收到飛機 ms>,<飛機已解鎖>,<roll>,<pitch>,<電池 V>
  PID,<axis>,<p>,<i>,<d>                                           回應 GET_PID
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


# ── USB 序列幀 (電腦 -> 地面站) ──────────────────────────────────────────────

MAGIC = b'\xa5\x5a'
FRAME_CONTROL, FRAME_TUNE, FRAME_GET_PID = 0x01, 0x02, 0x03
CMD_NONE, CMD_ARM, CMD_KILL, CMD_MPU_CALIBRATE, CMD_MPU_CLEAR = 0, 1, 2, 3, 4
AXIS_FIELD_BYTES = 16


def crc8(data: bytes, crc: int = 0) -> int:
    """CRC-8，多項式 0x07、初值 0 (與 serial_link.h 相同)。"""
    for byte in data:
        crc ^= byte
        for _ in range(8):
            crc = ((crc << 1) ^ 0x07) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


def frame(ftype: int, payload: bytes = b'') -> bytes:
    body = bytes([ftype, len(payload)]) + payload
    return MAGIC + body + bytes([crc8(body)])


def pack_control_frame(st: ControlState, cmd: int = CMD_NONE) -> bytes:
    return frame(FRAME_CONTROL, struct.pack('<Hhhhh', st.throttle, st.roll, st.pitch, st.yaw, cmd))


def pack_tune_frame(axis: str, p: float, i: float, d: float) -> bytes:
    raw = axis.encode('ascii')
    if not raw or len(raw) >= AXIS_FIELD_BYTES:
        raise ValueError('axis name too long')
    return frame(FRAME_TUNE, struct.pack('<16sfff', raw, p, i, d))


def pack_get_pid_frame() -> bytes:
    return frame(FRAME_GET_PID)


def parse_status(line: str) -> Optional[dict[str, Any]]:
    """STATUS,<g_armed>,<age_ms>,<d_armed>,<roll>,<pitch>,<battery V>[,<drone flags>]

    drone flags (飛機回傳的旗標)：bit0 已解鎖, bit1 MPU 校正中, bit2 MPU 已校正。
    """
    parts = line.strip().split(',')
    if len(parts) not in (7, 8) or parts[0] != 'STATUS':
        return None
    try:
        g_armed, age, d_armed = int(parts[1]), int(parts[2]), int(parts[3])
        roll, pitch, bat = float(parts[4]), float(parts[5]), float(parts[6])
        flags = int(parts[7]) if len(parts) == 8 else 0
    except ValueError:
        return None
    alive = age >= 0
    return {
        'ground_armed': g_armed == 1,
        'drone_rx_age_ms': None if age < 0 else age,
        'drone_armed': None if d_armed < 0 else d_armed == 1,
        'roll': roll, 'pitch': pitch, 'battery': bat,
        'drone_calibrating': alive and bool(flags & 2),
        'mpu_calibrated': (bool(flags & 4) if alive else None),
    }


def parse_pid_line(line: str) -> Optional[tuple[str, dict[str, float]]]:
    """PID,<axis>,<p>,<i>,<d>"""
    parts = line.strip().split(',')
    if len(parts) != 5 or parts[0] != 'PID':
        return None
    try:
        return parts[1], {'p': float(parts[2]), 'i': float(parts[3]), 'd': float(parts[4])}
    except ValueError:
        return None


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
