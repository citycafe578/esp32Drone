"""Flask + Socket.IO 橋接程式 (入口)。

職責：
  * 提供前端需要的 REST / Socket.IO API
  * 把搖桿訊號經 ControlSession 送往地面站 (Wi‑Fi WebSocket 或 USB 序列埠)
  * 接收 Geohash / GPS 遙測 -> 解碼 -> 推送給前端地圖
  * 相機串流、設定與飛行紀錄

執行：python -u apps/bridge/server.py [--sim]   (--sim 或環境變數 DRONE_SIM=1 啟動 GPS 模擬器)
"""
from __future__ import annotations

import atexit
import os
import sys

from flask import Flask, Response, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import configs  # noqa: E402
from camera import CameraManager  # noqa: E402
from control import ControlSession  # noqa: E402
from link import LinkManager  # noqa: E402
from sim import Simulator  # noqa: E402
from telemetry import TelemetryHub  # noqa: E402

try:
    sys.stdout.reconfigure(line_buffering=True)
except Exception:  # noqa: BLE001
    pass

HOST = os.environ.get('DRONE_HOST', '127.0.0.1')   # 預設只開放本機；要給區網使用請設 0.0.0.0
PORT = int(os.environ.get('DRONE_PORT', '5000'))
ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173',
           'http://localhost:4173', 'http://127.0.0.1:4173']
ORIGINS += [o.strip() for o in os.environ.get('DRONE_CORS', '').split(',') if o.strip()]

app = Flask(__name__)
CORS(app, origins=ORIGINS)
socketio = SocketIO(app, cors_allowed_origins=ORIGINS, async_mode='threading')


def emit(event: str, data: dict) -> None:
    socketio.emit(event, data)


configs.load()
camera = CameraManager()
hub = TelemetryHub(emit, configs.FLIGHTS_DIR)
links = LinkManager(hub.ingest_text)
control = ControlSession(links, emit)
simulator = Simulator(hub)


def apply_link_settings() -> dict:
    o = configs.get_section('otherSettings')
    return links.configure(o['linkMode'], host=o['groundHost'], port=o['reciver'])


def apply_camera_settings() -> None:
    try:
        camera.set_index(int(configs.get_section('otherSettings').get('imageTransmission') or 0))
    except ValueError:
        camera.set_index(0)


def bad_request(msg: str, code: int = 400):
    return jsonify({'status': 'error', 'error': msg}), code


# ── 設定 ──────────────────────────────────────────────────────────────────
@app.get('/settings')
def get_settings():
    return jsonify(configs.get_all())


@app.post('/settings/<section>')
def post_settings(section: str):
    body = request.get_json(silent=True)
    try:
        value = configs.set_section(section, body)
    except KeyError:
        return bad_request(f'unknown section: {section}', 404)
    except (ValueError, TypeError) as e:
        return bad_request(str(e))
    if section == 'otherSettings':
        apply_link_settings()
        apply_camera_settings()
    return jsonify({'status': 'ok', 'value': value})


@app.post('/set_drone_settings')
def set_drone_settings():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return bad_request('body must be an object')
    # 前端傳布林值，後端統一存成 "True"/"False" 字串
    for k, v in list(body.items()):
        if isinstance(v, bool):
            body[k] = 'True' if v else 'False'
    configs.set_section('droneSettings', body)
    return jsonify({'status': 'ok'})


# ── 相機 ──────────────────────────────────────────────────────────────────
@app.get('/video_feed')
def video_feed():
    if not camera.available:
        return bad_request('OpenCV 未安裝：pip install opencv-python', 503)
    return Response(camera.frames(), mimetype='multipart/x-mixed-replace; boundary=frame')


@app.get('/list_cameras')
def list_cameras():
    refresh = request.args.get('refresh') == '1'
    return jsonify({'cameras': camera.list_cameras(refresh=refresh)})


@app.post('/set_camera')
def set_camera_route():
    data = request.get_json(silent=True) or {}
    try:
        idx = int(data.get('imageTransmission', 0))
    except (TypeError, ValueError):
        return bad_request('imageTransmission must be an integer')
    configs.set_section('otherSettings', {'imageTransmission': str(idx)})
    camera.set_index(idx)
    return jsonify({'status': 'ok', 'camera_index': idx})


@app.post('/pause_camera')
def pause_camera():
    camera.pause()
    return jsonify({'status': 'ok'})


@app.post('/resume_camera')
def resume_camera():
    camera.resume()
    return jsonify({'status': 'ok'})


@app.get('/camera_status')
def camera_status():
    return jsonify(camera.status())


# ── 連線 (地面站) ──────────────────────────────────────────────────────────
@app.get('/get_ports')
def get_ports():
    try:
        import serial.tools.list_ports as lp
        ports = [{'device': p.device, 'name': p.description} for p in lp.comports()]
    except ImportError:
        ports = []
    return jsonify({'ports': ports})


@app.post('/set_port')
def set_port():
    port = (request.get_json(silent=True) or {}).get('port', '')
    if not port:
        return bad_request('port is required')
    configs.set_section('otherSettings', {'reciver': port, 'linkMode': 'serial'})
    st = apply_link_settings()
    return jsonify({'status': 'ok', 'port': port, 'link': st})


@app.route('/link', methods=['GET', 'POST'])
def link_route():
    if request.method == 'POST':
        body = request.get_json(silent=True) or {}
        patch = {k: body[k] for k in ('linkMode', 'groundHost', 'reciver') if k in body}
        if patch.get('linkMode') not in (None, 'wifi', 'serial'):
            return bad_request('linkMode must be wifi or serial')
        configs.set_section('otherSettings', patch)
        apply_link_settings()
    return jsonify(control.status())


# ── 遙測 / GPS ────────────────────────────────────────────────────────────
@app.get('/telemetry')
def telemetry_get():
    return jsonify({'latest': hub.latest, 'home': hub.home, 'sim': simulator.running,
                    'trail': list(hub.trail)})


@app.post('/telemetry')
def telemetry_post():
    """任何來源 (中繼程式、測試腳本) 都可以 POST 一筆遙測進來。
    例：{"geohash": "wsqqqxy1k", "heading": 90, "alt": 1.5}"""
    body = request.get_json(silent=True)
    if body is None:
        body = request.get_data(as_text=True)
    out = hub.ingest(body)
    if out is None:
        return bad_request('無法解析的遙測資料 (需要有效的 geohash 或 lat/lng)')
    return jsonify({'status': 'ok', 'telemetry': out})


@app.post('/home')
def home_route():
    body = request.get_json(silent=True) or {}
    if 'lat' in body and 'lng' in body:
        try:
            return jsonify(hub.set_home(float(body['lat']), float(body['lng'])))
        except (TypeError, ValueError):
            return bad_request('lat/lng must be numbers')
    home = hub.set_home_here()
    if home is None:
        return bad_request('目前沒有定位資料', 409)
    return jsonify(home)


@app.post('/trail/clear')
def trail_clear():
    hub.clear_trail()
    return jsonify({'status': 'ok'})


@app.post('/sim')
def sim_route():
    enabled = bool((request.get_json(silent=True) or {}).get('enabled', not simulator.running))
    simulator.start() if enabled else simulator.stop()
    return jsonify({'status': 'ok', 'sim': enabled})


# ── 航點 ──────────────────────────────────────────────────────────────────
@app.route('/waypoints', methods=['GET', 'POST'])
def waypoints_route():
    if request.method == 'POST':
        body = request.get_json(silent=True)
        try:
            return jsonify({'waypoints': configs.set_section('waypoints', body)})
        except ValueError as e:
            return bad_request(str(e))
    return jsonify({'waypoints': configs.get_section('waypoints')})


# ── 飛行紀錄 ──────────────────────────────────────────────────────────────
@app.get('/flights')
def flights_list():
    return jsonify({'flights': hub.list_flights()})


@app.get('/flights/<fid>')
def flights_get(fid: str):
    d = hub.get_flight(fid)
    return jsonify(d) if d else bad_request('not found', 404)


@app.delete('/flights/<fid>')
def flights_delete(fid: str):
    return jsonify({'status': 'ok'}) if hub.delete_flight(fid) else bad_request('not found', 404)


@app.post('/flights/stop')
def flights_stop():
    return jsonify({'id': hub.flush_recording()})


# ── Socket.IO ─────────────────────────────────────────────────────────────
@socketio.on('control_signal')
def handle_signal(signal_data):
    if isinstance(signal_data, dict):
        control.update(signal_data)


@socketio.on('telemetry_in')
def handle_telemetry_in(data):
    hub.ingest(data)


@socketio.on('connect')
def handle_connect():
    socketio.emit('control_state', control.status())
    if hub.latest:
        socketio.emit('telemetry', hub.latest)


atexit.register(hub.flush_recording)

if __name__ == '__main__':
    apply_camera_settings()
    apply_link_settings()
    if os.environ.get('DRONE_SIM') == '1' or '--sim' in sys.argv:
        simulator.start()
    print(f'Bridge listening on http://{HOST}:{PORT}')
    socketio.run(app, host=HOST, port=PORT, debug=False, use_reloader=False, allow_unsafe_werkzeug=True)
