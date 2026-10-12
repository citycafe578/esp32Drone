"""PID 調參與 MPU 校正。

地面站韌體 (hardware/ground) 已經有這些 HTTP 端點，這裡只是轉送，不重複實作：
  Serial 模式則走序列幀：GET_PID / TUNE / CONTROL(cmd=3,4)，由地面站回 PID 文字行。

  GET /tune                               目前 PID (寫在 HTML 表格裡，這裡解析出來)
  GET /update?axis=&param=&value=         修改單一參數；地面站會存檔並用 ESP-NOW 轉給飛機
  GET /mpu、/clearMpu                     校正 / 清除 MPU6050 (飛機必須在地上、未解鎖)

注意：飛機沒有回報確認，「送出成功」只代表地面站收到。
"""
from __future__ import annotations

import math
import re
import urllib.parse
from typing import Any

from link import SerialLink, WifiLink
import protocol

AXES = {'Roll': 'roll', 'Pitch': 'pitch', 'Yaw': 'yaw', 'Rate Roll': 'rate_roll', 'Rate Pitch': 'rate_pitch'}
PARAMS = ('p', 'i', 'd')
MAX_ABS_VALUE = 10_000.0

_ROW = re.compile(r'<tr>\s*<td>([^<]+)</td>\s*<td>([^<]*)</td>\s*<td>([^<]*)</td>\s*<td>([^<]*)</td>\s*</tr>')


class TuningError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def parse_pid_table(html: str) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for name, p, i, d in _ROW.findall(html):
        axis = AXES.get(name.strip())
        if axis is None:
            continue
        try:
            out[axis] = {'p': float(p), 'i': float(i), 'd': float(d)}
        except ValueError:
            continue
    return out


def _wifi(link: Any) -> WifiLink:
    if not isinstance(link, WifiLink):
        raise TuningError('尚未連線到地面站 (請選擇 USB Serial 或 Wi‑Fi 連線)', 409)
    return link


def _get(link: WifiLink, path: str) -> str:
    body = link.http_get(path)
    if body is None:
        raise TuningError('地面站沒有回應，請確認已連上 Drone_GCS_Relay')
    return body


def read_pid(link: Any) -> dict[str, dict[str, float]]:
    if isinstance(link, SerialLink):
        table = link.request_pid()
        if len(table) < 5:
            raise TuningError('地面站沒有回傳 PID (請確認韌體已更新)')
        return table
    table = parse_pid_table(_get(_wifi(link), '/tune'))
    if not table:
        raise TuningError('無法解析地面站的 PID 頁面')
    return table


def format_value(v: float) -> str:
    return format(v, '.8f').rstrip('0').rstrip('.') or '0'


def set_pid(link: Any, axis: Any, param: Any, value: Any) -> None:
    if axis not in AXES.values():
        raise TuningError(f'axis 必須是 {sorted(AXES.values())}', 400)
    if param not in PARAMS:
        raise TuningError('param 必須是 p / i / d', 400)
    try:
        v = float(value)
    except (TypeError, ValueError):
        raise TuningError('value 必須是數字', 400) from None
    if not math.isfinite(v) or abs(v) > MAX_ABS_VALUE:
        raise TuningError('value 超出範圍', 400)
    if isinstance(link, SerialLink):
        # 序列幀一次帶整組 P/I/D：先讀回目前的值，只改指定的那個
        triple = dict(read_pid(link)[axis])
        triple[param] = v
        if not link.send_tune(axis, triple['p'], triple['i'], triple['d']):
            raise TuningError('序列埠寫入失敗')
        return
    query = urllib.parse.urlencode({'axis': axis, 'param': param, 'value': format_value(v)})
    _get(_wifi(link), f'/update?{query}')


def mpu(link: Any, clear: bool, armed: bool) -> None:
    if armed:
        raise TuningError('已解鎖時不能校正，請先鎖定並讓飛機靜置', 409)
    if isinstance(link, SerialLink):
        cmd = protocol.CMD_MPU_CLEAR if clear else protocol.CMD_MPU_CALIBRATE
        if not link.send_command(cmd, repeat=2):
            raise TuningError('序列埠寫入失敗')
        return
    body = _get(_wifi(link), '/clearMpu' if clear else '/mpu')
    if body.strip() == 'ERROR':
        raise TuningError('地面站拒絕：飛機仍處於解鎖狀態', 409)
