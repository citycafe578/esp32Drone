#include <SPI.h>
#include <RF24.h>
//roll kp == 3.1 kd == 0.8
RF24 radio(7, 8); // CE=7, CSN=8
const byte address[6] = "00001";

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("Arduino Initialized!");

  if (!radio.begin()) {
    Serial.println("Radio hardware is not responding!");
    while (1);
  }

  radio.setPALevel(RF24_PA_HIGH);
  radio.setDataRate(RF24_2MBPS);
  radio.setChannel(100);
  radio.openWritingPipe(address);
  radio.setAutoAck(false);
  radio.stopListening();
}

void loop() {
  int throttle = analogRead(A0);
  // int rawP = map(analogRead(A5), 0, 1023, 0, 511);
  // int rawP = analogRead(A5);
  // rawP = map(rawP, 0, 1023, 0, 511);
  Serial.println(rawP);
  if(throttle < 100){
    rawP = 0;
  }
  
  char sendData[32];
  snprintf(sendData, sizeof(sendData), "%d,%d", throttle, rawP);

  Serial.print("Send: ");
  Serial.println(sendData);

  bool success = radio.write(&sendData, sizeof(sendData));
  if (success) {
    Serial.println("Send successfully");
  } else {
    Serial.println("Send failed!");
  }

  delay(200); // 每 100ms 傳一次
}
