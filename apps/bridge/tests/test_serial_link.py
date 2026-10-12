import threading
import time

import link
import protocol


class FakeSer:
    def __init__(self):
        self.written = []

    def write(self, data):
        self.written.append(bytes(data))


def make():
    texts = []
    sl = link.SerialLink(texts.append, 'COM_FAKE')
    sl._ser = FakeSer()
    sl._port_open = True
    return sl, texts


def test_not_connected_until_status():
    sl, _ = make()
    assert not sl.connected
    sl._handle_line('STATUS,0,-1,-1,0,0,0')
    assert sl.connected
    assert sl.status()['ground_armed'] is False


def test_geo_lines_forwarded_status_not():
    sl, texts = make()
    sl._handle_line('GEO,wsqqqxy1k,10,1,1,7.4,8')
    sl._handle_line('STATUS,0,100,1,1,2,7.4')
    assert texts == ['GEO,wsqqqxy1k,10,1,1,7.4,8']


def test_arm_confirmed_by_status():
    sl, _ = make()
    sl._handle_line('STATUS,0,-1,-1,0,0,0')
    threading.Timer(0.1, lambda: sl._handle_line('STATUS,1,50,1,0,0,7.4')).start()
    assert sl.arm() is True
    frame = sl._ser.written[0]
    assert frame[2] == protocol.FRAME_CONTROL
    assert sl.status()['drone_armed'] is True


def test_arm_times_out_without_status():
    sl, _ = make()
    sl._handle_line('STATUS,0,-1,-1,0,0,0')
    sl.STATUS_TIMEOUT_S = 10
    t = time.monotonic()
    assert sl.arm() is False
    assert time.monotonic() - t < 3


def test_kill_sends_three_frames():
    sl, _ = make()
    assert sl.kill()
    assert len(sl._ser.written) == 3


def test_request_pid_collects_five_axes():
    sl, _ = make()

    def feed():
        for a in ('roll', 'pitch', 'yaw', 'rate_roll', 'rate_pitch'):
            sl._handle_line(f'PID,{a},1,2,3')
    threading.Timer(0.1, feed).start()
    out = sl.request_pid(timeout=2)
    assert len(out) == 5 and out['roll'] == {'p': 1.0, 'i': 2.0, 'd': 3.0}
