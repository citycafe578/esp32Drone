#pragma once
// 電腦 (USB 序列) <-> 地面站 的二進位幀協定。純 C++，不依賴 Arduino，可在電腦上單元測試。
// 對應的 Python 實作：apps/bridge/protocol.py (兩邊必須一致，tests/test_firmware_protocol.py 會互相驗證)。
//
//   0xA5 0x5A | type | len | payload[len] | crc8        (crc8: poly 0x07, init 0, 涵蓋 type..payload)
//
//   type 0x01 CONTROL  len 10 : uint16 throttle, int16 roll, int16 pitch, int16 yaw, int16 cmd   (小端)
//                               cmd: 0 一般  1 ARM  2 KILL  3 校正MPU  4 清除MPU
//   type 0x02 TUNE     len 28 : char axis[16], float p, float i, float d
//   type 0x03 GET_PID  len 0
#include <stddef.h>
#include <stdint.h>
#include <string.h>

namespace gcs {

constexpr uint8_t kMagic0 = 0xA5;
constexpr uint8_t kMagic1 = 0x5A;
constexpr size_t kMaxPayload = 64;

enum FrameType : uint8_t { kControl = 0x01, kTune = 0x02, kGetPid = 0x03 };

inline uint8_t crc8(const uint8_t *d, size_t n, uint8_t crc = 0) {
  for (size_t i = 0; i < n; i++) {
    crc ^= d[i];
    for (int b = 0; b < 8; b++) crc = (crc & 0x80) ? (uint8_t)((crc << 1) ^ 0x07) : (uint8_t)(crc << 1);
  }
  return crc;
}

struct Frame {
  uint8_t type;
  uint8_t len;
  uint8_t payload[kMaxPayload];
};

// 逐 byte 餵入；收到一個 CRC 正確的完整幀時回傳 true。
// 資料錯位 / CRC 錯誤會自動重新找下一個幀頭，不需要外部處理。
class FrameParser {
 public:
  bool push(uint8_t b, Frame &out) {
    switch (state_) {
      case kM0:
        if (b == kMagic0) state_ = kM1;
        break;
      case kM1:
        if (b == kMagic1) state_ = kType;
        else if (b != kMagic0) state_ = kM0;
        break;
      case kType:
        cur_.type = b;
        crc_ = crc8(&b, 1);
        state_ = kLen;
        break;
      case kLen:
        if (b > kMaxPayload) { state_ = kM0; break; }
        cur_.len = b;
        crc_ = crc8(&b, 1, crc_);
        idx_ = 0;
        state_ = b ? kPayload : kCrc;
        break;
      case kPayload:
        cur_.payload[idx_++] = b;
        crc_ = crc8(&b, 1, crc_);
        if (idx_ == cur_.len) state_ = kCrc;
        break;
      case kCrc:
        state_ = kM0;
        if (b == crc_) { out = cur_; return true; }
        break;
    }
    return false;
  }

 private:
  enum State { kM0, kM1, kType, kLen, kPayload, kCrc };
  State state_ = kM0;
  Frame cur_ = {};
  uint8_t crc_ = 0;
  uint8_t idx_ = 0;
};

struct ControlCmd {
  uint16_t throttle;
  int16_t roll, pitch, yaw, cmd;
};

struct TuneCmd {
  char axis[17];  // 16 bytes + 結尾 NUL
  float p, i, d;
};

inline bool parseControl(const Frame &f, ControlCmd &c) {
  if (f.type != kControl || f.len != 10) return false;
  const uint8_t *p = f.payload;
  c.throttle = (uint16_t)(p[0] | (p[1] << 8));
  c.roll = (int16_t)(p[2] | (p[3] << 8));
  c.pitch = (int16_t)(p[4] | (p[5] << 8));
  c.yaw = (int16_t)(p[6] | (p[7] << 8));
  c.cmd = (int16_t)(p[8] | (p[9] << 8));
  return true;
}

inline bool parseTune(const Frame &f, TuneCmd &t) {
  if (f.type != kTune || f.len != 28) return false;
  memcpy(t.axis, f.payload, 16);
  t.axis[16] = 0;
  memcpy(&t.p, f.payload + 16, 4);
  memcpy(&t.i, f.payload + 20, 4);
  memcpy(&t.d, f.payload + 24, 4);
  return true;
}

// Geohash 只允許 base32 字元 (沒有 a i l o)；用來擋掉飛機傳來的亂碼，避免污染給電腦的文字行。
inline bool isGeohash(const char *s, size_t cap) {
  size_t n = 0;
  for (; n < cap && s[n]; n++) {
    char c = s[n];
    bool ok = (c >= '0' && c <= '9') || (c >= 'b' && c <= 'z' && c != 'i' && c != 'l' && c != 'o');
    if (!ok) return false;
  }
  return n >= 1;
}

}  // namespace gcs
