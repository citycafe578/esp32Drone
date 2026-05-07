#include <Arduino.h>
#include <SPI.h>
#include <RF24.h>

// ESP32-C3 Super Mini wiring.
#define NRF_SCK 4
#define NRF_MISO 5
#define NRF_MOSI 6
#define NRF_CSN 7
#define NRF_CE 10

const uint8_t NRF_CHANNEL = 100;
const byte ADDRESS[6] = "DTEST";

RF24 radio(NRF_CE, NRF_CSN);

struct __attribute__((packed)) TestPacket {
  uint32_t counter;
  uint32_t ms;
  int16_t value;
};

uint32_t counter = 0;
bool radioReady = false;

void setup() {
  Serial.begin(115200);
  unsigned long serialStart = millis();
  while (!Serial && millis() - serialStart < 3000) {
    delay(10);
  }

  delay(500);
  Serial.println();
  Serial.println("=== NRF24 DRONE TX TEST ===");

  SPI.begin(NRF_SCK, NRF_MISO, NRF_MOSI, NRF_CSN);

  if (!radio.begin()) {
    Serial.println("radio.begin() failed");
    return;
  }

  radio.setChannel(NRF_CHANNEL);
  radio.setDataRate(RF24_250KBPS);
  radio.setPALevel(RF24_PA_LOW);
  radio.setAutoAck(false);
  radio.setPayloadSize(sizeof(TestPacket));
  radio.openWritingPipe(ADDRESS);
  radio.stopListening();

  Serial.printf("chip=%s channel=%u payload=%u\n",
                radio.isChipConnected() ? "connected" : "not connected",
                NRF_CHANNEL,
                (unsigned)sizeof(TestPacket));
  radioReady = true;
}

void loop() {
  if (!radioReady) {
    Serial.println("radio not ready; check NRF wiring, power, CE/CSN/SPI pins");
    delay(1000);
    return;
  }

  TestPacket packet = {
    counter++,
    millis(),
    -4321,
  };

  bool ok = radio.write(&packet, sizeof(packet));
  Serial.printf("TX counter=%lu ms=%lu result=%s\n",
                (unsigned long)packet.counter,
                (unsigned long)packet.ms,
                ok ? "ok" : "failed");

  delay(1000);
}
