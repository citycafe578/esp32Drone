import struct

import protocol


def test_wifi_packet_matches_ground_firmware():
    st = protocol.ControlState(throttle=1234, roll=1400, pitch=1600, yaw=1450)
    pkt = protocol.pack_wifi(st)
    assert len(pkt) == 10  # hardware/ground: length == 10
    # 韌體順序：throttle(u16), roll, pitch, yaw, 保留
    assert struct.unpack('<Hhhhh', pkt) == (1234, 1400, 1600, 1450, 0)


def test_control_frame_layout_and_crc():
    f = protocol.pack_control_frame(protocol.ControlState(throttle=1100), protocol.CMD_ARM)
    assert f[0] == 0xA5 and f[1] == 0x5A and f[2] == 0x01 and f[3] == 10
    assert f[-1] == protocol.crc8(f[2:-1])
    assert struct.unpack('<Hhhhh', f[4:14])[0] == 1100


def test_parse_status_and_pid():
    s = protocol.parse_status('STATUS,1,230,0,1.5,-2.0,7.4')
    assert s and s['ground_armed'] and s['drone_rx_age_ms'] == 230 and s['battery'] == 7.4
    assert protocol.parse_status('STATUS,0,-1,-1,0,0,0')['drone_rx_age_ms'] is None
    pid = protocol.parse_pid_line('PID,roll,1.0,0.5,0.2')
    assert pid is not None and pid[0] == 'roll'


def test_control_state_sanitizes_input():
    st = protocol.ControlState.from_signal({'throttle': 9999, 'pitch': -5, 'yaw': 'abc', 'roll': None, 'start_up': 1})
    assert (st.throttle, st.pitch, st.yaw, st.roll) == (2000, 1000, 1500, 1500)
    assert st.start_up == 1 and st.emergency_stop == 0


def test_neutral_is_safe():
    st = protocol.ControlState.neutral()
    assert st.throttle == 1000 and st.start_up == 0


def test_parse_csv_json_and_bare():
    csv = protocol.parse_telemetry('GEO,wsqqqxy1k,123.4,1.8,0.6,11.7,9')
    assert csv['geohash'] == 'wsqqqxy1k' and csv['heading'] == 123.4 and csv['sats'] == 9
    js = protocol.parse_telemetry('{"gh":"wsqqqxy1k","hdg":370,"altitude":2}')
    assert js['heading'] == 10.0 and js['alt'] == 2.0
    assert protocol.parse_telemetry(b'wsqqqxy1k')['geohash'] == 'wsqqqxy1k'
    assert protocol.parse_telemetry('$GEO:wsqqqxy1k,,5')['alt'] == 5.0


def test_parse_lat_lng_without_geohash():
    t = protocol.parse_telemetry({'lat': 25.0, 'lng': 121.5})
    assert t['geohash'] is None and t['lat'] == 25.0


def test_parse_rejects_garbage():
    for bad in ['', 'hello world', 'GEO,ailo', '{not json', '{"heading": 3}', None, 42]:
        assert protocol.parse_telemetry(bad) is None
