#include <Arduino.h>
#include <Wire.h>
#include <SPI.h>
#include <RF24.h>

#define SCK 18
#define MISO 19
#define MOSI 23
#define CSN 4
#define CE 21

RF24 radio(CE, CSN);
const byte address[6] = "00001";
char receivedData[32] = {0};
const uint8_t NRF_CHANNEL = 100;

struct __attribute__((packed)) ComData {
  uint8_t header;
  uint8_t cmd;
  int16_t throttle;
  int16_t pitch;
  int16_t yaw;
  int16_t roll;
  int16_t emergency_stop;
  int16_t start_up;
  int16_t speed_mode;
  int16_t obstacle_avoidance;
  int16_t still_dont_know;
};

ComData myData;

void setup(){
  Serial.begin(115200);
  SPI.begin(SCK, MISO, MOSI, CSN);
  if (!radio.begin()) {
    Serial.println("NRF24L01 Hardware not found!");
    while (1); 
  }
  Serial.println("NRF24L01 started successfully");
  radio.openWritingPipe(address);
  radio.setChannel(NRF_CHANNEL);
  radio.setPALevel(RF24_PA_LOW);
  radio.setDataRate(RF24_250KBPS);
  radio.setPayloadSize(sizeof(ComData));
  radio.setRetries(5, 15);
  radio.stopListening();
  Serial.printf("NRF config: channel=%u payload=%u chip=%s\n",
                NRF_CHANNEL,
                (unsigned)sizeof(ComData),
                radio.isChipConnected() ? "connected" : "not connected");
}


void loop() {
  if (Serial.available() > 0) {
    if (Serial.peek() != 0xAA) {
      Serial.read();
      return;
    }

    if (Serial.available() >= sizeof(ComData)) {
      Serial.readBytes((char *)&myData, sizeof(ComData));
      
      if (myData.header == 0xAA) {
        Serial.printf(
          "RX throttle=%d pitch=%d yaw=%d roll=%d arm=%d estop=%d\n",
          myData.throttle,
          myData.pitch,
          myData.yaw,
          myData.roll,
          myData.start_up,
          myData.emergency_stop
        );
        bool ok = radio.write(&myData, sizeof(ComData));
        Serial.printf("NRF send: %s\n", ok ? "ok" : "failed");
      }
    }
  }
}
