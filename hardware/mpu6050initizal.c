#include <Wire.h>
#include <MPU6050.h>

MPU6050 mpu;

void setup() {
  Serial.begin(115200);
  Wire.begin();
  
  Serial.println("Initializing MPU6050...");
  mpu.initialize();
  if (!mpu.testConnection()) {
    Serial.println("MPU6050 connection failed");
    while(1);
  }

  Serial.println("\n===== 開始校準 =====");
  Serial.println("請確保無人機絕對水平且靜止！");
  delay(3000); // 給你時間手離開

  // 重置偏移量
  mpu.setXAccelOffset(0);
  mpu.setYAccelOffset(0);
  mpu.setZAccelOffset(0);
  mpu.setXGyroOffset(0);
  mpu.setYGyroOffset(0);
  mpu.setZGyroOffset(0);

  // 執行自動校準
  mpu.CalibrateAccel(6);
  mpu.CalibrateGyro(6);
  
  // 顯示結果
  Serial.println("\n===== 校準完成！請複製以下數值 =====");
  mpu.PrintActiveOffsets();
  Serial.println("\n=====================================");
}

void loop() {
  // 這裡什麼都不用做
}