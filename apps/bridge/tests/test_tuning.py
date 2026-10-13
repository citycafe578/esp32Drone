import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

import tuning
from link import WifiLink

TUNE_HTML = """
<table><thead><tr><th>軸向</th><th>P</th><th>I</th><th>D</th></tr></thead><tbody>
<tr><td>Roll</td><td>1.50</td><td>0.02</td><td>0.30</td></tr>
<tr><td>Pitch</td><td>1.50</td><td>0.02</td><td>0.30</td></tr>
<tr><td>Yaw</td><td>2.00</td><td>0.00</td><td>0.00</td></tr>
<tr><td>Rate Roll</td><td>0.80</td><td>0.10</td><td>0.01</td></tr>
<tr><td>Rate Pitch</td><td>0.80</td><td>0.10</td><td>0.01</td></tr>
</tbody></table>
"""


class FakeGround(BaseHTTPRequestHandler):
    seen: list[str] = []
    mpu_reply = b'OK'

    def do_GET(self):
        FakeGround.seen.append(self.path)
        if self.path == '/pid':
            names = ['roll', 'pitch', 'yaw', 'rate_roll', 'rate_pitch']
            body = ''.join(f'PID,{a},{n},0.5,0.25\n' for n, a in enumerate(names, 1)).encode()
        else:
            body = TUNE_HTML.encode() if self.path == '/tune' else FakeGround.mpu_reply
        self.send_response(200)
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


@pytest.fixture
def link():
    FakeGround.seen = []
    FakeGround.mpu_reply = b'OK'
    srv = ThreadingHTTPServer(('127.0.0.1', 0), FakeGround)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield WifiLink(lambda s: None, f'127.0.0.1:{srv.server_address[1]}')
    srv.shutdown()


def test_parse_table():
    t = tuning.parse_pid_table(TUNE_HTML)
    assert t['roll'] == {'p': 1.5, 'i': 0.02, 'd': 0.3}
    assert set(t) == {'roll', 'pitch', 'yaw', 'rate_roll', 'rate_pitch'}


def test_read_pid(link):
    # 地面站有 /pid 時用飛機實際的值
    t = tuning.read_pid(link)
    assert t['roll'] == {'p': 1.0, 'i': 0.5, 'd': 0.25} and t['rate_pitch']['p'] == 5.0


def test_set_pid_sends_firmware_query(link):
    tuning.set_pid(link, 'rate_pitch', 'd', 0.0125)
    assert FakeGround.seen[-1] == '/update?axis=rate_pitch&param=d&value=0.0125'


@pytest.mark.parametrize('axis,param,value', [
    ('nope', 'p', 1), ('roll', 'x', 1), ('roll', 'p', 'abc'), ('roll', 'p', float('nan')), ('roll', 'p', 1e9),
])
def test_set_pid_validates(link, axis, param, value):
    with pytest.raises(tuning.TuningError) as e:
        tuning.set_pid(link, axis, param, value)
    assert e.value.status == 400 and not FakeGround.seen


def test_mpu_actions(link):
    tuning.mpu(link, clear=False, armed=False)
    tuning.mpu(link, clear=True, armed=False)
    assert FakeGround.seen == ['/mpu', '/clearMpu']


def test_mpu_refused_when_armed_or_ground_says_error(link):
    with pytest.raises(tuning.TuningError):
        tuning.mpu(link, clear=False, armed=True)
    assert FakeGround.seen == []
    FakeGround.mpu_reply = b'ERROR'
    with pytest.raises(tuning.TuningError):
        tuning.mpu(link, clear=False, armed=False)


def test_requires_wifi_mode():
    with pytest.raises(tuning.TuningError) as e:
        tuning.read_pid(object())
    assert e.value.status == 409


def test_unreachable_ground():
    with pytest.raises(tuning.TuningError):
        tuning.read_pid(WifiLink(lambda s: None, '127.0.0.1:9'))
