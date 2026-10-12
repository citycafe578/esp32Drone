import struct

import protocol


def test_wifi_packet_matches_ground_firmware():
    st = protocol.ControlState(throttle=1234, roll=1400, pitch=1600, yaw=1450)
    pkt = protocol.pack_wifi(st)
    assert len(pkt) == 10  # hardware/ground: length == 10
    # 韌體順序：throttle(u16), roll, pitch, yaw, 保留
    assert struct.unpack('<Hhhhh', pkt) == (1234, 1400, 1600, 1450, 0)


def test_serial_packet_layout():
    pkt = protocol.pack_serial(protocol.ControlState(throttle=1100), armed=True)
    assert pkt[0] == 0xAA and pkt[1] == 0x01 and len(pkt) == 20


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
