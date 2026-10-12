"""Geohash 編碼 / 解碼 (無外部相依)。"""
from __future__ import annotations

import math

_BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'
_DECODE = {c: i for i, c in enumerate(_BASE32)}


def is_valid(gh: object) -> bool:
    return isinstance(gh, str) and 1 <= len(gh) <= 12 and all(c in _DECODE for c in gh.lower())


def decode_exactly(gh: str) -> tuple[float, float, float, float]:
    """回傳 (lat, lon, lat_err, lon_err)；lat/lon 為格子中心，err 為半格寬度 (度)。"""
    if not is_valid(gh):
        raise ValueError(f'invalid geohash: {gh!r}')
    lat_lo, lat_hi = -90.0, 90.0
    lon_lo, lon_hi = -180.0, 180.0
    even = True  # 偶數位元 = 經度
    for ch in gh.lower():
        cd = _DECODE[ch]
        for mask in (16, 8, 4, 2, 1):
            if even:
                mid = (lon_lo + lon_hi) / 2
                if cd & mask:
                    lon_lo = mid
                else:
                    lon_hi = mid
            else:
                mid = (lat_lo + lat_hi) / 2
                if cd & mask:
                    lat_lo = mid
                else:
                    lat_hi = mid
            even = not even
    return ((lat_lo + lat_hi) / 2, (lon_lo + lon_hi) / 2,
            (lat_hi - lat_lo) / 2, (lon_hi - lon_lo) / 2)


def decode(gh: str) -> tuple[float, float]:
    lat, lon, _, _ = decode_exactly(gh)
    return lat, lon


def encode(lat: float, lon: float, precision: int = 9) -> str:
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError('lat/lon out of range')
    lat_lo, lat_hi = -90.0, 90.0
    lon_lo, lon_hi = -180.0, 180.0
    out = []
    bits = 0
    bit_count = 0
    even = True
    while len(out) < precision:
        if even:
            mid = (lon_lo + lon_hi) / 2
            if lon >= mid:
                bits = (bits << 1) | 1
                lon_lo = mid
            else:
                bits <<= 1
                lon_hi = mid
        else:
            mid = (lat_lo + lat_hi) / 2
            if lat >= mid:
                bits = (bits << 1) | 1
                lat_lo = mid
            else:
                bits <<= 1
                lat_hi = mid
        even = not even
        bit_count += 1
        if bit_count == 5:
            out.append(_BASE32[bits])
            bits = 0
            bit_count = 0
    return ''.join(out)


def error_meters(lat: float, lat_err: float, lon_err: float) -> float:
    """格子半寬換算成公尺 (取南北 / 東西較大者)。"""
    dy = lat_err * 111_320.0
    dx = lon_err * 111_320.0 * math.cos(math.radians(lat))
    return max(dx, dy)
