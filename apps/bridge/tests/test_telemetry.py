import geohash
from telemetry import TelemetryHub


def make(tmp_path):
    events = []
    hub = TelemetryHub(lambda ev, data: events.append((ev, data)), str(tmp_path))
    return hub, events


def test_ingest_decodes_geohash_and_emits(tmp_path):
    hub, events = make(tmp_path)
    out = hub.ingest_text('GEO,wsqqqxy1k,90,2.5')
    lat, lng = geohash.decode('wsqqqxy1k')
    assert out['lat'] == lat and out['lng'] == lng
    assert out['heading'] == 90 and out['heading_source'] == 'sensor'
    assert out['accuracy_m'] and out['distance_home'] == 0
    assert events[-1][0] == 'telemetry'


def test_first_fix_is_home_and_distance_grows(tmp_path):
    hub, _ = make(tmp_path)
    hub.ingest({'geohash': geohash.encode(25.0, 121.5, 9)})
    out = hub.ingest({'geohash': geohash.encode(25.001, 121.5, 9)})
    assert 100 < out['distance_home'] < 125  # 0.001° ≈ 111 m


def test_heading_derived_from_motion_when_missing(tmp_path):
    hub, _ = make(tmp_path)
    hub.ingest({'geohash': geohash.encode(25.0, 121.5, 9)})
    out = hub.ingest({'geohash': geohash.encode(25.001, 121.5, 9)})  # 往北
    assert out['heading_source'] == 'gps'
    assert out['heading'] < 5 or out['heading'] > 355


def test_jitter_does_not_change_heading(tmp_path):
    hub, _ = make(tmp_path)
    hub.ingest({'geohash': geohash.encode(25.0, 121.5, 9), 'heading': 200})
    out = hub.ingest({'lat': 25.0000001, 'lng': 121.5000001})
    assert out['heading'] == 200  # 位移太小 (GPS 抖動) 時沿用上一個航向


def test_invalid_is_ignored(tmp_path):
    hub, events = make(tmp_path)
    assert hub.ingest_text('nonsense') is None
    assert hub.ingest({'geohash': 'bad!'}) is None
    assert events == []


def test_flight_recording_roundtrip(tmp_path):
    hub, _ = make(tmp_path)
    for i in range(5):
        hub._rec_last = 0  # 略過 2Hz 節流，加速測試
        hub.ingest({'geohash': geohash.encode(25.0 + i * 1e-4, 121.5, 9), 'alt': 1 + i})
    fid = hub.flush_recording()
    assert fid
    assert [f['id'] for f in hub.list_flights()] == [fid]
    detail = hub.get_flight(fid)
    assert detail['max_alt_m'] == 5 and len(detail['points']) == 5
    assert hub.get_flight('../../etc/passwd') is None
    assert hub.delete_flight(fid) and hub.list_flights() == []
