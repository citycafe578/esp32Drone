import importlib
import json


def load_configs(tmp_path, monkeypatch, content=None):
    path = tmp_path / 'settings.json'
    if content is not None:
        path.write_text(json.dumps(content), encoding='utf-8')
    monkeypatch.setenv('DRONE_SETTINGS', str(path))
    import configs
    importlib.reload(configs)
    return configs, path


def test_migrates_legacy_file(tmp_path, monkeypatch):
    legacy = {
        'joystickIndex': 0,
        'axisMapping': {'altitude': 2, 'pitch': 1, 'yaw': 0, 'roll': 3},
        'btnMapping': {'downward obstacle avoidance': 4, 'start up': 7},
        'otherSettings': {'imageTransmission': '1', 'reciver': 'COM3', 'LAWSE': '1'},
        'droneSettings': {'imageHorizontalFlip': True, 'geoFenceRadius': 'False', 'autoReturnHome': 'False'},
    }
    c, path = load_configs(tmp_path, monkeypatch, legacy)
    s = c.load()
    assert s['axisMapping']['throttle'] == 2 and 'altitude' not in s['axisMapping']
    assert s['btnMapping']['obstacle avoidance'] == 4
    assert s['droneSettings']['imageHorizontalFlip'] == 'True'
    assert s['droneSettings']['geoFenceRadius'] == 'OFF'
    assert s['otherSettings']['reciver'] == 'COM3' and s['otherSettings']['linkMode'] == 'serial'
    assert json.loads(path.read_text(encoding='utf-8')) == s  # 已寫回新格式


def test_missing_or_corrupt_file_falls_back_to_defaults(tmp_path, monkeypatch):
    c, path = load_configs(tmp_path, monkeypatch)
    assert c.load()['otherSettings']['groundHost'] == '192.168.4.1'
    path.write_text('{ broken', encoding='utf-8')
    assert c.load()['joystickIndex'] == 0


def test_set_section_merges_and_validates(tmp_path, monkeypatch):
    c, _ = load_configs(tmp_path, monkeypatch)
    c.load()
    out = c.set_section('otherSettings', {'sharpen': '50'})
    assert out['sharpen'] == '50' and out['linkMode'] == 'serial'
    assert c.set_section('waypoints', [{'lat': 1, 'lng': 2}, {'lat': 999, 'lng': 0}, {'x': 1}]) == [{'lat': 1.0, 'lng': 2.0}]
    for bad in (('nope', {}), ):
        try:
            c.set_section(*bad)
            assert False
        except KeyError:
            pass
    try:
        c.set_section('droneSettings', [])
        assert False
    except ValueError:
        pass


def test_helpers():
    import configs
    assert configs.number_or_none('OFF') is None and configs.number_or_none('50') == 50
    assert configs.flag({'a': 'True'}, 'a') and not configs.flag({'a': 'False'}, 'a')
