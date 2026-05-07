#include <Arduino.h>
#include <SPI.h>
#include <RF24.h>

// ESP32-WROOM / ESP32 DevKit VSPI wiring:
// NRF24 VCC -> 3V3, GND -> GND, SCK -> GPIO18, MISO -> GPIO19,
// MOSI -> GPIO23, CSN -> GPIO4, CE -> GPIO21, IRQ not connected.
#define NRF_SCK 18
#define NRF_MISO 19
#define NRF_MOSI 23
#define NRF_CSN 4
#define NRF_CE 21

const uint8_t NRF_CHANNEL = 100;
const byte ADDRESS[6] = "DTEST";

RF24 radio(NRF_CE, NRF_CSN);

struct __attribute__((packed)) TestPacket {
  uint32_t counter;
  uint32_t ms;
  int16_t value;
};

uint32_t counter = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println();
  Serial.println("=== NRF24 GROUND TX TEST ===");

  SPI.begin(NRF_SCK, NRF_MISO, NRF_MOSI, NRF_CSN);

  if (!radio.begin()) {
    Serial.println("radio.begin() failed");
    while (true) {
      delay(1000);
    }
  }

  radio.setChannel(NRF_CHANNEL);
  radio.setDataRate(RF24_250KBPS);
  radio.setPALevel(RF24_PA_LOW);
  radio.setAutoAck(false);
  radio.setPayloadSize(sizeof(TestPacket));
  radio.setRetries(5, 15);
  radio.openWritingPipe(ADDRESS);
  radio.stopListening();

  Serial.printf("chip=%s channel=%u payload=%u\n",
                radio.isChipConnected() ? "connected" : "not connected",
                NRF_CHANNEL,
                (unsigned)sizeof(TestPacket));
}

void loop() {
  TestPacket packet = {
    counter++,
    millis(),
    1234,
  };

  bool ok = radio.write(&packet, sizeof(packet));
  Serial.printf("TX counter=%lu ms=%lu result=%s\n",
                (unsigned long)packet.counter,
                (unsigned long)packet.ms,
                ok ? "ok" : "failed");

  delay(1000);
}
