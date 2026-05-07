#include <Arduino.h>
#include <SPI.h>
#include <RF24.h>

// ESP32-C3 Super Mini wiring:
// NRF24 VCC -> 3V3, GND -> GND, SCK -> GPIO4, MISO -> GPIO5,
// MOSI -> GPIO6, CSN -> GPIO7, CE -> GPIO10, IRQ not connected.
#define NRF_SCK 4
#define NRF_MISO 5
#define NRF_MOSI 6
#define NRF_CSN 7
#define NRF_CE 10

const uint8_t NRF_CHANNEL = 100;
const byte ADDRESS[6] = "DTEST";

RF24 radio(NRF_CE, NRF_CSN);
bool radioReady = false;

struct __attribute__((packed)) TestPacket {
  uint32_t counter;
  uint32_t ms;
  int16_t value;
};

unsigned long lastPacketMs = 0;

void setup() {
  Serial.begin(115200);
  unsigned long serialStart = millis();
  while (!Serial && millis() - serialStart < 3000) {
    delay(10);
  }

  delay(500);
  Serial.println();
  Serial.println("=== NRF24 DRONE RX TEST ===");
  Serial.println("stage: serial ok");

  SPI.begin(NRF_SCK, NRF_MISO, NRF_MOSI, NRF_CSN);
  Serial.println("stage: spi begin ok");

  if (!radio.begin()) {
    Serial.println("radio.begin() failed");
    return;
  }
  Serial.println("stage: radio begin ok");

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
    Serial.println("radio not ready; check NRF wiring, power, CE/CSN/SPI pins");
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
