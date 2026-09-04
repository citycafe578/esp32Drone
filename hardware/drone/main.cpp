#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <AutoPID.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <Preferences.h>

bool motorArmed = false;
int throttle = 1000;
unsigned long lastRecvTime = 0;
int target_roll = 1500, target_pitch = 1500, target_yaw = 1500;

namespace Flight {
    constexpr int MaxThrottle = 1600;
    constexpr int SafeThrottle = 1400;
    constexpr float MaxTilt = 15.0f;
    constexpr float MaxYawRate = 30.0f;
}


#pragma pack(1)
struct ESPNowControlPacket{ // 飛行控制
    uint8_t type;
    uint16_t throttle;
    int16_t roll;
    int16_t pitch;
    int16_t yaw;
    int16_t cmd;       // 0:正常, 1:ARM, 2:KILL, 3:校正MPU, 4:清除MPU
};

struct ESPNowTunePacket { // turning
    uint8_t type;
    char axis[16];
    float p;
    float i;
    float d;
};
#pragma pack()

Preferences prefs;
struct AxisPID{ double p, i, d; };
AxisPID rate_rollPID = {0,0,0}, rate_pitchPID = {0,0,0}, rate_yawPID = {0,0,0};
AxisPID rollPID = {0,0,0}, pitchPID = {0,0,0}, yawPID = {0,0,0};

struct MpuData{ float roll_off, pitch_off, gyro_x_off, gyro_y_off, gyro_z_off; };
MpuData mpuData = {0,0,0,0,0};

Adafruit_MPU6050 mpu;
float roll = 0, pitch = 0, yaw = 0, dt = 0;
unsigned long prev_time = 0;


double setpoint_roll = 0, input_roll, output_roll;
double setpoint_pitch = 0, input_pitch, output_pitch;
double setpoint_yaw = 0, input_yaw, output_yaw;
double setpoint_rate_roll = 0, input_rate_roll, output_rate_roll;
double setpoint_rate_pitch = 0, input_rate_pitch, output_rate_pitch;

AutoPID pid_rate_roll(&input_rate_roll, &setpoint_rate_roll, &output_rate_roll, -400, 400, rate_rollPID.p, rate_rollPID.i, rate_rollPID.d);
AutoPID pid_rate_pitch(&input_rate_pitch, &setpoint_rate_pitch, &output_rate_pitch, -400, 400, rate_pitchPID.p, rate_pitchPID.i, rate_pitchPID.d);
AutoPID pid_roll(&input_roll, &setpoint_roll, &output_roll, -90, 90, rollPID.p, rollPID.i, rollPID.d);
AutoPID pid_pitch(&input_pitch, &setpoint_pitch, &output_pitch, -90, 90, pitchPID.p, pitchPID.i, pitchPID.d);
AutoPID pid_yaw(&input_yaw, &setpoint_yaw, &output_yaw, -100, 100, yawPID.p, yawPID.i, yawPID.d);

int servo_pins[4] = {1, 3, 0, 2};

void writeMotorUS(int channel, int us){
    us = constrain(us, 1000, 2000);
    ledcWrite(channel, map(us, 1000, 2000, 819, 1638));
}

void save_PID_config(){
    prefs.begin("PIDs", false);
    prefs.putBytes("rate_rollPID", &rate_rollPID, sizeof(rate_rollPID));
    prefs.putBytes("rate_pitchPID", &rate_pitchPID, sizeof(rate_pitchPID));
    prefs.putBytes("rollPID", &rollPID, sizeof(rollPID));
    prefs.putBytes("pitchPID", &pitchPID, sizeof(pitchPID));
    prefs.putBytes("yawPID", &yawPID, sizeof(yawPID));
    prefs.end();
}

void save_Mpu_config(){ prefs.begin("Mpu", false); prefs.putBytes("mpuData", &mpuData, sizeof(mpuData)); prefs.end(); }

void load_PID_config(){
    prefs.begin("PIDs", true);
    if (prefs.isKey("rollPID")) {
        prefs.getBytes("rate_rollPID", &rate_rollPID, sizeof(rate_rollPID));
        prefs.getBytes("rate_pitchPID", &rate_pitchPID, sizeof(rate_pitchPID));
        prefs.getBytes("rollPID", &rollPID, sizeof(rollPID));
        prefs.getBytes("pitchPID", &pitchPID, sizeof(pitchPID));
        prefs.getBytes("yawPID", &yawPID, sizeof(yawPID));
    }
    prefs.end();
}

void load_Mpu_config(){
    prefs.begin("Mpu", true);
    if (prefs.isKey("mpuData")) prefs.getBytes("mpuData", &mpuData, sizeof(mpuData));
    prefs.end();
}

void init_mpu(){
    motorArmed = false; throttle = 1000;
    if (!mpu.begin()) return;
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setGyroRange(MPU6050_RANGE_250_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_10_HZ);
    
    float sum_roll = 0, sum_pitch = 0, sum_gx = 0, sum_gy = 0, sum_gz = 0;
    for (int i = 0; i < 1500; i++) {
        sensors_event_t a, g, temp;
        mpu.getEvent(&a, &g, &temp);
        sum_roll += atan2(a.acceleration.z, a.acceleration.x) * 57.296;
        sum_pitch += atan2(-a.acceleration.y, sqrt(a.acceleration.x * a.acceleration.x + a.acceleration.z * a.acceleration.z)) * 57.296;
        sum_gx += g.gyro.x; sum_gy += g.gyro.y; sum_gz += g.gyro.z;
        vTaskDelay(1 / portTICK_PERIOD_MS);
    }
    mpuData.roll_off = (sum_roll / 1500) - 90;
    mpuData.pitch_off = (sum_pitch / 1500);
    mpuData.gyro_x_off = sum_gx / 1500;
    mpuData.gyro_y_off = sum_gy / 1500;
    mpuData.gyro_z_off = sum_gz / 1500;
    save_Mpu_config();
}

// ==========================================
// ESP-NOW 接收回呼函數
// ==========================================
void OnDataRecv(const uint8_t * mac, const uint8_t *incomingData, int len) {
    if (len == 0) return;
    uint8_t packetType = incomingData[0];
    Serial.printf("ESP-NOW RX len=%d type=%d\n",
                  len,
                  incomingData[0]);

    // 飛行控制
    if (packetType == 0 && len == sizeof(ESPNowControlPacket)) {
        ESPNowControlPacket packet;
        memcpy(&packet, incomingData, sizeof(packet));

        lastRecvTime = millis(); // 更新失控保護計時器

        // 處理特殊指令
        if (packet.cmd == 1) motorArmed = true;
        else if (packet.cmd == 2) { motorArmed = false; throttle = 1000; }
        else if (packet.cmd == 3) { if (!motorArmed) init_mpu(); }
        else if (packet.cmd == 4) { if (!motorArmed) { mpuData = {0,0,0,0,0}; save_Mpu_config(); } }

        // 更新飛行目標值
        throttle = constrain(packet.throttle, 1000, Flight::SafeThrottle);
        target_roll = constrain(packet.roll, 1000, 2000);
        target_pitch = constrain(packet.pitch, 1000, 2000);
        target_yaw = constrain(packet.yaw, 1000, 2000);
    } 
    // turning
    else if (packetType == 1 && len == sizeof(ESPNowTunePacket)) {
        ESPNowTunePacket packet;
        memcpy(&packet, incomingData, sizeof(packet));
        String axis = String(packet.axis);

        if (axis == "roll") { rollPID.p = packet.p; rollPID.i = packet.i; rollPID.d = packet.d; pid_roll.setGains(packet.p, packet.i, packet.d); }
        else if (axis == "pitch") { pitchPID.p = packet.p; pitchPID.i = packet.i; pitchPID.d = packet.d; pid_pitch.setGains(packet.p, packet.i, packet.d); }
        else if (axis == "yaw") { yawPID.p = packet.p; yawPID.i = packet.i; yawPID.d = packet.d; pid_yaw.setGains(packet.p, packet.i, packet.d); }
        else if (axis == "rate_roll") { rate_rollPID.p = packet.p; rate_rollPID.i = packet.i; rate_rollPID.d = packet.d; pid_rate_roll.setGains(packet.p, packet.i, packet.d); }
        else if (axis == "rate_pitch") { rate_pitchPID.p = packet.p; rate_pitchPID.i = packet.i; rate_pitchPID.d = packet.d; pid_rate_pitch.setGains(packet.p, packet.i, packet.d); }
        
        save_PID_config();
        Serial.printf("Updated %s PID: %.2f %.2f %.2f\n", axis.c_str(), packet.p, packet.i, packet.d);
    }
}

void FlightTask(void *pvParameters) {
    TickType_t xLastWakeTime = xTaskGetTickCount();
    const TickType_t xFrequency = 5 / portTICK_PERIOD_MS; // 200Hz 

    while (true) {
        // 掉包一秒強制斷電
        if (motorArmed && (millis() - lastRecvTime > 1000)) {
            motorArmed = false;
            throttle = 1000;
            target_roll = 1500; target_pitch = 1500; target_yaw = 1500;
        }

        sensors_event_t a, g, temp;
        mpu.getEvent(&a, &g, &temp);

        unsigned long current_time = micros();
        if (prev_time == 0) prev_time = current_time;
        dt = (current_time - prev_time) / 1000000.0;
        prev_time = current_time;

        float raw_roll_angle = atan2(a.acceleration.z, a.acceleration.x) * 57.296;
        float raw_pitch_angle = atan2(-a.acceleration.y, sqrt(a.acceleration.x * a.acceleration.x + a.acceleration.z * a.acceleration.z)) * 57.296;
        float final_acc_roll = raw_roll_angle - mpuData.roll_off;
        float final_acc_pitch = raw_pitch_angle - mpuData.pitch_off;
        float gyro_roll_rate = (g.gyro.y - mpuData.gyro_y_off) * 57.296;
        float gyro_pitch_rate = (g.gyro.x - mpuData.gyro_x_off) * 57.296;
        float gyro_yaw_rate = (g.gyro.z - mpuData.gyro_z_off) * 57.296;

        static bool first_run = true;
        if (first_run) { roll = final_acc_roll; pitch = final_acc_pitch; first_run = false; }

        roll = 0.98 * (roll + gyro_roll_rate * dt) + 0.02 * final_acc_roll;
        pitch = 0.98 * (pitch + gyro_pitch_rate * dt) + 0.02 * final_acc_pitch;
        yaw += gyro_yaw_rate * dt;

        throttle = constrain(throttle, 1000, Flight::SafeThrottle);

        if (throttle < 1050 || !motorArmed) {
            // AutoPID 重置
            pid_roll.stop(); pid_roll.reset(); output_roll = 0;
            pid_pitch.stop(); pid_pitch.reset(); output_pitch = 0;
            pid_yaw.stop(); pid_yaw.reset(); output_yaw = 0;
            pid_rate_roll.stop(); pid_rate_roll.reset(); output_rate_roll = 0;
            pid_rate_pitch.stop(); pid_rate_pitch.reset(); output_rate_pitch = 0;
        } else {
            if (abs(roll - 90) > 45 || abs(pitch) > 45) motorArmed = false;

            setpoint_roll = constrain((target_roll - 1500) * 0.03, -Flight::MaxTilt, Flight::MaxTilt) + 90;
            setpoint_pitch = constrain((target_pitch - 1500) * 0.03, -Flight::MaxTilt, Flight::MaxTilt);
            setpoint_yaw = constrain((target_yaw - 1500) * 0.12, -Flight::MaxYawRate, Flight::MaxYawRate);

            input_roll = roll; input_pitch = pitch; input_yaw = yaw;
            pid_roll.run(); pid_pitch.run(); pid_yaw.run();

            setpoint_rate_roll = output_roll;
            setpoint_rate_pitch = output_pitch;
            input_rate_roll = gyro_roll_rate;
            input_rate_pitch = -gyro_pitch_rate;

            pid_rate_roll.run(); pid_rate_pitch.run();
        }

        int fl = constrain(throttle + output_rate_roll - output_rate_pitch, 1000, Flight::SafeThrottle);
        int fr = constrain(throttle - output_rate_roll - output_rate_pitch, 1000, Flight::SafeThrottle);
        int bl = constrain(throttle + output_rate_roll + output_rate_pitch, 1000, Flight::SafeThrottle);
        int br = constrain(throttle - output_rate_roll + output_rate_pitch, 1000, Flight::SafeThrottle);

        if (motorArmed) { writeMotorUS(0, fl); writeMotorUS(1, fr); writeMotorUS(2, bl); writeMotorUS(3, br); } 
        else { writeMotorUS(0, 1000); writeMotorUS(1, 1000); writeMotorUS(2, 1000); writeMotorUS(3, 1000); }

        vTaskDelayUntil(&xLastWakeTime, xFrequency);
    }
}

void setup() {
    Serial.begin(115200);
    delay(300);
    Serial.println("\n=== DRONE BOOT (ESP-NOW + AutoPID) ===");

    WiFi.mode(WIFI_STA);
    WiFi.disconnect();
    
    // 強制頻道鎖定 Channel 1
    esp_wifi_set_promiscuous(true);
    esp_wifi_set_channel(1, WIFI_SECOND_CHAN_NONE);
    esp_wifi_set_promiscuous(false);

    if (esp_now_init() != ESP_OK) {
        Serial.println("ESP-NOW Init Failed!");
        return;
    }
    esp_now_register_recv_cb(OnDataRecv);
    Serial.println("ESP-NOW Ready. Listening for Ground Station...");

    for (int i = 0; i < 4; i++) {
        ledcSetup(i, 50, 14);
        ledcAttachPin(servo_pins[i], i);
        writeMotorUS(i, 1000);
    }

    Wire.begin(8, 9);
    Wire.setClock(400000); 
    if (!mpu.begin()) { Serial.println("MPU Init Failed!"); while (1); }
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setGyroRange(MPU6050_RANGE_250_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

    load_Mpu_config(); load_PID_config();

    // 載入 AutoPID 設定與參數
    pid_rate_roll.setBangBang(0); pid_rate_pitch.setBangBang(0); pid_roll.setBangBang(0); pid_pitch.setBangBang(0); pid_yaw.setBangBang(0);
    pid_rate_roll.setTimeStep(5); pid_rate_pitch.setTimeStep(5); pid_roll.setTimeStep(5); pid_pitch.setTimeStep(5); pid_yaw.setTimeStep(5);
    pid_rate_roll.setGains(rate_rollPID.p, rate_rollPID.i, rate_rollPID.d);
    pid_rate_pitch.setGains(rate_pitchPID.p, rate_pitchPID.i, rate_pitchPID.d);
    pid_roll.setGains(rollPID.p, rollPID.i, rollPID.d);
    pid_pitch.setGains(pitchPID.p, pitchPID.i, pitchPID.d);
    pid_yaw.setGains(yawPID.p, yawPID.i, yawPID.d);

    xTaskCreate(FlightTask, "FlightTask", 4096, NULL, 3, NULL);
}

void loop() { vTaskDelete(NULL); }