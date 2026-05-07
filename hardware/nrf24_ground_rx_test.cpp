#include <Arduino.h>
#include <SPI.h>
#include <RF24.h>

// ESP32-WROOM / ESP32 DevKit VSPI wiring.
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

bool radioReady = false;
unsigned long lastPacketMs = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println();
  Serial.println("=== NRF24 GROUND RX TEST ===");

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
  radio.openReadingPipe(1, ADDRESS);
  radio.startListening();

  Serial.printf("chip=%s channel=%u payload=%u\n",
                radio.isChipConnected() ? "connected" : "not connected",
                NRF_CHANNEL,
                (unsigned)sizeof(TestPacket));
  radioReady = true;
}

void loop() {
  if (!radioReady) {
    Serial.println("radio not ready");
    delay(1000);
    return;
  }

  if (radio.available()) {
    TestPacket packet;
    radio.read(&packet, sizeof(packet));
    lastPacketMs = millis();

    Serial.printf("RX counter=%lu sender_ms=%lu value=%d local_ms=%lu\n",
                  (unsigned long)packet.counter,
                  (unsigned long)packet.ms,
                  packet.value,
                  (unsigned long)lastPacketMs);
  }

  static unsigned long lastIdlePrint = 0;
  if (millis() - lastIdlePrint > 2000) {
    lastIdlePrint = millis();
    Serial.printf("waiting... last_packet_age=%lu\n",
                  lastPacketMs == 0 ? 0 : (unsigned long)(millis() - lastPacketMs));
  }
}
