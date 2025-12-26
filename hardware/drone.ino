#include <Wire.h>
#include <MPU6050.h>
#include <SPI.h>
#include <RF24.h>
#include <ESP32Servo.h>
#include <AutoPID.h>
#include <EasyButton.h>

#define MY_SCK  4
#define MY_MISO 5
#define MY_MOSI 6
#define MY_CSN  7
#define MY_CE   10

//nrf
RF24 radio(MY_CE, MY_CSN);
const byte address[6] = "00001";
char receivedData[32] = {0};

//motors
Servo FL, FR, BL, BR;
int servo_pins[4] = { 1, 3, 0, 2 };
int throttle;

// MPU6050
MPU6050 mpu;
float roll = 0;
unsigned long lastTime = 0;

//pid
double setpoint_roll = 0;
double input_roll, output_roll;
double kp = 1.5, ki = 0.0, kd = 0.8;
AutoPID pid_roll(&input_roll, &setpoint_roll, &output_roll, -400, 400, kp, ki, kd);

//mpu init
EasyButton button(9);

void blinks(int times){
  for(int i = 0; i < times; i++){
    digitalWrite(8, HIGH);
    delay(100);
    digitalWrite(8, LOW);
    delay(100);
  }
}

void init_mpu(){
  digitalWrite(8, HIGH);
  delay(3000);
  mpu.setXAccelOffset(0);
  mpu.setYAccelOffset(0);
  mpu.setZAccelOffset(0);
  mpu.setXGyroOffset(0);
  mpu.setYGyroOffset(0);
  mpu.setZGyroOffset(0);

  mpu.CalibrateAccel(6);
  mpu.CalibrateGyro(6);
  Serial.println("\n===== 校準完成！=====");
  mpu.PrintActiveOffsets();
  Serial.println("\n=====================================");
  digitalWrite(8, LOW);
  delay(500);
  blinks(3);
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("Receiver Initialized!");
  pinMode(8, OUTPUT);

  Wire.begin();
  mpu.initialize();
  if (!mpu.testConnection()) {
    Serial.println("MPU6050 連接失敗！");
    while (1);
  }

  mpu.setXAccelOffset(-3022);  
  mpu.setYAccelOffset(936); 
  mpu.setZAccelOffset(3268); 

  mpu.setXGyroOffset(-30);
  mpu.setYGyroOffset(-3);
  mpu.setZGyroOffset(46);

  SPI.begin(MY_SCK, MY_MISO, MY_MOSI, MY_CSN);
  if (!radio.begin()) {
    Serial.println("Radio hardware is not responding!");
    while (1);
  }

  radio.setPALevel(RF24_PA_HIGH);
  radio.setDataRate(RF24_2MBPS);
  radio.setChannel(100);
  radio.openReadingPipe(1, address);
  radio.setAutoAck(false);
  radio.startListening();

  FL.attach(servo_pins[0]);
  FR.attach(servo_pins[1]);
  BL.attach(servo_pins[2]);
  BR.attach(servo_pins[3]);
  lastTime = millis();

  pid_roll.setBangBang(0);
  pid_roll.setTimeStep(20);
  pid_roll.setGains(kp, ki, kd);
  pid_roll.run();

  button.onPressedFor(3000, init_mpu);
}

void loop(){
  if (radio.available()) {
    radio.read(&receivedData, sizeof(receivedData));
    int throttleRaw = 0;
    int kpRaw = 0;

    sscanf(receivedData, "%d,%d", &throttleRaw, &kpRaw);
    throttle = constrain(map(throttleRaw, 0, 1023, 1000, 2000), 1000, 2000);
    kp = kpRaw / 20.0;

    pid_roll.setGains(kp, ki, kd); // 只更新 Kp

    Serial.print("Throttle: ");
    Serial.print(throttle);
    Serial.print(" | Kp: ");
    Serial.println(kp);
  }

  // 讀取 MPU6050
  int16_t ax, ay, az, gx, gy, gz;
  mpu.getMotion6(&ax, &ay, &az, &gx, &gy, &gz);

  unsigned long now = millis();
  float dt = (now - lastTime) / 1000.0;
  lastTime = now;

  float acc_roll = atan2(ay, sqrt(ax * ax + az * az)) * 180.0 / PI;
  float gyro_roll_rate = gy / 131.0;
  roll = 0.98 * (roll + gyro_roll_rate * dt) + 0.02 * acc_roll;

  // PID 控制 roll
  input_roll = roll;
  pid_roll.run();

  int fl = constrain(throttle + output_roll, 1000, 2000);
  int fr = constrain(throttle - output_roll, 1000, 2000);
  int bl = constrain(throttle + output_roll, 1000, 2000);
  int br = constrain(throttle - output_roll, 1000, 2000);

  if(fl > 1800){
    fl = 1800;
  }
  if(fr > 1800){
    fr = 1800;
  }
  if(bl > 1800){
    bl = 1800;
  }
  if(br > 1800){
    br = 1800;
  }

  FL.writeMicroseconds(fl);
  FR.writeMicroseconds(fr);
  BL.writeMicroseconds(bl);
  BR.writeMicroseconds(br);

  Serial.print("Roll: "); Serial.print(roll);
  Serial.print(" | PID_R: "); Serial.print(output_roll);
  Serial.print(" | FL: "); Serial.print(fl);
  Serial.print(" | FR: "); Serial.print(fr);
  Serial.print(" | BL: "); Serial.print(bl);
  Serial.print(" | BR: "); Serial.println(br);

  button.update();

  delay(20);
}