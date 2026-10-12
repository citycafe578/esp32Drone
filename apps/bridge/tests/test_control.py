import time

import protocol
from control import ControlSession


class FakeLink:
    def __init__(self, connected=True, arm_ok=True):
        self.connected = connected
        self.arm_ok = arm_ok
        self.sent = []
        self.arms = 0
        self.kills = 0

    def send_control(self, st, armed):
        self.sent.append((st, armed))
        return True

    def arm(self):
        self.arms += 1
        return self.arm_ok

    def kill(self):
        self.kills += 1
        return True

    def status(self):
        return {'mode': 'fake', 'connected': self.connected, 'detail': ''}


class FakeLinks:
    def __init__(self, link):
        self.link = link

    def status(self):
        return self.link.status()


def make(link):
    events = []
    return ControlSession(FakeLinks(link), lambda ev, d: events.append((ev, d)), rate_hz=100), events


def alerts(events):
    return [d['message'] for ev, d in events if ev == 'alert']


def test_refuses_arm_with_high_throttle():
    link = FakeLink()
    cs, ev = make(link)
    cs.update({'throttle': 1500, 'start_up': 1})
    assert not cs.armed and link.arms == 0
    assert any('油門' in m for m in alerts(ev))


def test_arms_at_low_throttle_only_on_rising_edge():
    link = FakeLink()
    cs, _ = make(link)
    cs.update({'throttle': 1000, 'start_up': 1})
    cs.update({'throttle': 1000, 'start_up': 1})   # 按住不重複送
    assert cs.armed and link.arms == 1


def test_refuses_arm_when_link_down():
    link = FakeLink(connected=False)
    cs, ev = make(link)
    cs.update({'throttle': 1000, 'start_up': 1})
    assert not cs.armed and link.arms == 0
    assert any('尚未連線' in m for m in alerts(ev))


def test_emergency_stop_kills():
    link = FakeLink()
    cs, _ = make(link)
    cs.update({'throttle': 1000, 'start_up': 1})
    cs.update({'throttle': 1200, 'start_up': 0, 'emergency_stop': 1})
    assert not cs.armed and link.kills == 1


def test_signal_loss_disarms_and_sends_neutral():
    link = FakeLink()
    cs, ev = make(link)
    cs.update({'throttle': 1000, 'start_up': 1})
    cs.update({'throttle': 1300, 'start_up': 0})
    time.sleep(0.8)  # > STALE_AFTER_S
    assert not cs.armed and link.kills >= 1
    assert any('中斷' in m for m in alerts(ev))
    st, _ = link.sent[-1]
    assert st.throttle == protocol.THROTTLE_MIN and st.pitch == protocol.NEUTRAL


def test_failed_arm_does_not_arm():
    link = FakeLink(arm_ok=False)
    cs, _ = make(link)
    cs.update({'throttle': 1000, 'start_up': 1})
    assert not cs.armed
