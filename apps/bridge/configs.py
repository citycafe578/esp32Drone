"""設定檔的唯一來源 (settings.json)。

後端是設定的 single source of truth；前端的 localStorage 只是快取。
所有讀寫都經過這個模組，具備 thread lock 與原子寫入 (寫暫存檔再 os.replace)。
"""
from __future__ import annotations

import copy
import json
import os
import re
import tempfile
import threading
from typing import Any

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
# 執行期資料 (設定、飛行紀錄) 放在 <repo>/data，不進版本控制；可用 DRONE_DATA 改位置
DATA_DIR = os.environ.get('DRONE_DATA', os.path.join(REPO_ROOT, 'data'))
SETTINGS_FILE = os.environ.get('DRONE_SETTINGS', os.path.join(DATA_DIR, 'settings.json'))
FLIGHTS_DIR = os.environ.get('DRONE_FLIGHTS', os.path.join(DATA_DIR, 'flights'))

DEFAULTS: dict[str, Any] = {
    'joystickIndex': 0,
    'axisMapping': {'throttle': None, 'pitch': None, 'yaw': None, 'roll': None},
    'btnMapping': {
        'start up': None,
        'speed mode': None,
        'obstacle avoidance': None,
        'still dont know': None,
        'emergency stop': None,
    },
    'otherSettings': {
        'imageTransmission': '0',
        'reciver': '',
        'transmissionPower': 'Low',
        'LAWSE': 'Sound Effect 1',
        'sharpen': '0',
        'grayscale': '0',
        'linkMode': 'wifi',          # wifi = 連地面站 AP 的 WebSocket；serial = USB 序列埠
        'groundHost': '192.168.4.1',  # 地面站 SoftAP 的預設位址
    },
    'droneSettings': {
        'minimumCruisingAltitude': 'OFF',
        'lowAltitudeWarning': 'OFF',
        'imageHorizontalFlip': 'False',
        'imageVerticalFlip': 'False',
        'maximumCruisingAltitude': 'OFF',
        'geoFenceRadius': 'OFF',
        'autoReturnHome': 'False',
        'autoLanding': 'False',
    },
    'waypoints': [],
}

_DICT_SECTIONS = ('axisMapping', 'btnMapping', 'otherSettings', 'droneSettings')
_BOOL_STRING_KEYS = ('imageHorizontalFlip', 'imageVerticalFlip', 'autoReturnHome', 'autoLanding')

_lock = threading.RLock()
_cache: dict[str, Any] | None = None


def _to_bool_string(v: Any) -> str:
    if isinstance(v, str):
        return 'True' if v.strip().lower() in ('true', '1', 'on', 'yes') else 'False'
    return 'True' if v else 'False'


def _migrate(data: dict[str, Any]) -> dict[str, Any]:
    """把舊版 settings.json 轉成目前的格式，並補齊缺少的欄位。"""
    out = copy.deepcopy(DEFAULTS)
    if not isinstance(data, dict):
        return out

    for name in _DICT_SECTIONS:
        src = data.get(name)
        if isinstance(src, dict):
            out[name].update(src)

    # 舊鍵名 -> 新鍵名 (前後端統一)
    axis = out['axisMapping']
    if 'altitude' in axis:
        old = axis.pop('altitude')
        if axis.get('throttle') is None:
            axis['throttle'] = old
    btn = out['btnMapping']
    if 'downward obstacle avoidance' in btn:
        old = btn.pop('downward obstacle avoidance')
        if btn.get('obstacle avoidance') is None:
            btn['obstacle avoidance'] = old

    drone = out['droneSettings']
    for k in _BOOL_STRING_KEYS:
        drone[k] = _to_bool_string(drone.get(k, 'False'))
    for k in ('geoFenceRadius', 'maximumCruisingAltitude', 'minimumCruisingAltitude', 'lowAltitudeWarning'):
        v = drone.get(k)
        if v in (None, '', False, 'False', 'false'):
            drone[k] = 'OFF'
        else:
            drone[k] = str(v)

    other = out['otherSettings']
    for k in ('imageTransmission', 'sharpen', 'grayscale'):
        other[k] = str(other.get(k, '0') if other.get(k, '') != '' else '0')
    if other.get('linkMode') not in ('wifi', 'serial'):
        other['linkMode'] = 'wifi'
    if not other.get('groundHost'):
        other['groundHost'] = DEFAULTS['otherSettings']['groundHost']
    if other.get('reciver') in (None, 'null'):
        other['reciver'] = ''

    try:
        out['joystickIndex'] = int(data.get('joystickIndex', 0) or 0)
    except (TypeError, ValueError):
        out['joystickIndex'] = 0

    wps = data.get('waypoints')
    out['waypoints'] = _clean_waypoints(wps) if isinstance(wps, list) else []
    return out


def _clean_waypoints(items: list[Any]) -> list[dict[str, float]]:
    cleaned = []
    for it in items:
        try:
            lat, lng = float(it['lat']), float(it['lng'])
        except (KeyError, TypeError, ValueError):
            continue
        if -90 <= lat <= 90 and -180 <= lng <= 180:
            cleaned.append({'lat': lat, 'lng': lng})
    return cleaned


def _write(data: dict[str, Any]) -> None:
    d = os.path.dirname(SETTINGS_FILE)
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix='.settings.', suffix='.tmp', dir=d)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        os.replace(tmp, SETTINGS_FILE)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def load() -> dict[str, Any]:
    global _cache
    with _lock:
        try:
            with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                raw = json.load(f)
        except FileNotFoundError:
            raw = {}
        except (OSError, json.JSONDecodeError) as e:
            print(f'[settings] 讀取失敗，改用預設值: {e}')
            raw = {}
        _cache = _migrate(raw)
        try:
            _write(_cache)
        except OSError as e:
            print(f'[settings] 寫回失敗: {e}')
        return copy.deepcopy(_cache)


def get_all() -> dict[str, Any]:
    with _lock:
        if _cache is None:
            return load()
        return copy.deepcopy(_cache)


def get_section(name: str) -> Any:
    return get_all()[name]


def set_section(name: str, value: Any) -> Any:
    """更新單一區塊。dict 區塊採合併；waypoints 與 joystickIndex 直接取代。"""
    if name not in DEFAULTS:
        raise KeyError(name)
    with _lock:
        data = get_all()
        if name in _DICT_SECTIONS:
            if not isinstance(value, dict):
                raise ValueError(f'{name} 必須是物件')
            data[name].update(value)
        elif name == 'waypoints':
            if not isinstance(value, list):
                raise ValueError('waypoints 必須是陣列')
            data[name] = _clean_waypoints(value)
        elif name == 'joystickIndex':
            data[name] = int(value)
        data = _migrate(data)
        global _cache
        _cache = data
        _write(data)
        return copy.deepcopy(data[name])


def flag(drone_settings: dict[str, Any], key: str) -> bool:
    return _to_bool_string(drone_settings.get(key, 'False')) == 'True'


def number_or_none(value: Any) -> float | None:
    """'OFF' / '' / None -> None；其餘轉成 float。"""
    if value is None:
        return None
    s = str(value).strip()
    if not s or s.upper() == 'OFF':
        return None
    m = re.match(r'^-?\d+(\.\d+)?$', s)
    return float(s) if m else None
