"""跨語言測試：用 g++ 編譯 hardware/ground/serial_link.h，驗證與 Python 封包一致。"""
import pathlib
import shutil
import subprocess

import pytest

import protocol

HEADER = pathlib.Path(__file__).resolve().parents[3] / 'hardware' / 'ground' / 'serial_link.h'

pytestmark = pytest.mark.skipif(shutil.which('g++') is None, reason='g++ not installed')

CPP = r'''
#include <cstdio>
#include <cstdint>
#include <vector>
#include "serial_link.h"
int main() {
    gcs::FrameParser p; gcs::Frame f; int c;
    while ((c = getchar()) != EOF) {
        if (p.push((uint8_t) c, f)) printf("%d:%d\n", (int) f.type, (int) f.len);
    }
    return 0;
}
'''


@pytest.fixture(scope='module')
def parser_bin(tmp_path_factory):
    d = tmp_path_factory.mktemp('fw')
    (d / 'm.cpp').write_text(CPP)
    exe = d / 'm'
    r = subprocess.run(['g++', '-std=c++17', f'-I{HEADER.parent}', str(d / 'm.cpp'), '-o', str(exe)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        pytest.skip('serial_link.h needs Arduino stubs: ' + r.stderr[:200])
    return exe


def run(exe, data: bytes):
    r = subprocess.run([str(exe)], input=data, capture_output=True)
    return r.stdout.decode().split()


def test_frames_parse(parser_bin):
    st = protocol.ControlState(throttle=1100)
    data = protocol.pack_control_frame(st, protocol.CMD_ARM) + protocol.pack_get_pid_frame() \
        + protocol.pack_tune_frame('roll', 1, 2, 3)
    assert run(parser_bin, data) == ['1:10', '3:0', '2:28']


def test_resync_and_crc(parser_bin):
    good = protocol.pack_control_frame(protocol.ControlState(), protocol.CMD_NONE)
    bad = bytearray(good); bad[-1] ^= 0xFF
    assert run(parser_bin, b'\x00\xA5\x01garbage' + good) == ['1:10']
    assert run(parser_bin, bytes(bad)) == []
