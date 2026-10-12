import pytest

import geohash


def test_known_vectors():
    # 維基百科 / 參考實作的標準範例
    assert geohash.encode(57.64911, 10.40744, 11) == 'u4pruydqqvj'
    lat, lon, lat_err, lon_err = geohash.decode_exactly('ezs42')
    assert lat == pytest.approx(42.605, abs=1e-3)
    assert lon == pytest.approx(-5.603, abs=1e-3)
    assert lat_err == pytest.approx(0.02197, abs=1e-4)


def test_roundtrip_precision_9():
    lat, lon = 25.0330, 121.5654
    d_lat, d_lon = geohash.decode(geohash.encode(lat, lon, 9))
    assert abs(d_lat - lat) < 1e-4
    assert abs(d_lon - lon) < 1e-4


@pytest.mark.parametrize('bad', ['', 'a', 'ailo', 'wsqq!', 'x' * 13, None, 123])
def test_invalid(bad):
    assert not geohash.is_valid(bad)
    if isinstance(bad, str):
        with pytest.raises(ValueError):
            geohash.decode(bad)


def test_case_insensitive():
    assert geohash.decode('WSQQQXY1K') == geohash.decode('wsqqqxy1k')


def test_error_meters_shrinks_with_precision():
    errs = []
    for n in (5, 7, 9):
        lat, lon, la, lo = geohash.decode_exactly(geohash.encode(25.0, 121.5, n))
        errs.append(geohash.error_meters(lat, la, lo))
    assert errs[0] > errs[1] > errs[2]
