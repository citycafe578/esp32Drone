#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include "FixedPID.h"
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <esp_heap_caps.h>
#include <Preferences.h>
#include <TinyGPSPlus.h>

bool motorArmed = false;
int throttle = 1000;
unsigned long lastRecvTime = 0;
int target_roll = 1500, target_pitch = 1500, target_yaw = 1500;
TaskHandle_t flightTaskHandle = nullptr;
TaskHandle_t systemMonitorTaskHandle = nullptr;
const uint8_t broadcastAddress[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
volatile uint32_t flightCoreWorkPercent = 0;

namespace Flight {
    constexpr int MaxThrottle = 1600;
    constexpr int SafeThrottle = 1400;
    constexpr float MaxTilt = 15.0f;
    constexpr float MaxYawRate = 30.0f;
}


// ── 選配感測器 (沒接就維持預設，回傳欄位填 0) ───────────────────
// GPS 模組接 UART1：模組的 TX 接 GPS_RX_PIN，模組的 RX 接 GPS_TX_PIN。設成 -1 就停用。
#define GPS_RX_PIN 20
#define GPS_TX_PIN 21
#define GPS_BAUD 9600
// 電池電壓：ADC 腳位 (設 -1 停用)，電阻分壓倍數 = (R1+R2)/R2。
#define BATTERY_ADC_PIN -1
#define BATTERY_DIVIDER 2.0f

TinyGPSPlus gps;
HardwareSerial gpsSerial(1);
volatile bool calibrateReq = false;   // 由 ESP-NOW 回呼設定，FlightTask 內執行 (校正要 1.5 秒，不能卡在回呼裡)
volatile bool calibrating = false;
bool mpuCalibrated = false;
volatile bool pidReportReq = false;

#pragma pack(1)
struct ESPNowControlPacket{ // 飛行控制
    uint8_t type;
    uint16_t throttle;
    int16_t roll;
    int16_t pitch;
    int16_t yaw;
    int16_t cmd;       // 0:正常, 1:ARM, 2:KILL, 3:校正MPU, 4:清除MPU
};

struct ESPNowRequestPacket { // 地面站 -> 飛機：type 3 = 請回報目前 PID
    uint8_t type;
};

struct ESPNowPidReportPacket { // 飛機 -> 地面站：type 4 = 單一軸的 PID
    uint8_t type;
    char axis[16];
    float p;
    float i;
    float d;
};

struct ESPNowTunePacket { // turning
    uint8_t type;
    char axis[16];
    float p;
    float i;
    float d;
};

struct ESPNowTelemetryPacket{ // 飛機 -> 地面站 (type = 2)；欄位定義見 docs/telemetry-protocol.md
    uint8_t type;          // 固定 2
    char geohash[12];      // 沒有定位時整個為 0
    int16_t heading;       // 度 (0=北, 順時針)
    int16_t alt_cm;        // 公分
    uint16_t speed_cms;    // 公分/秒
    uint16_t battery_mv;   // 毫伏 (0 = 未量測)
    uint8_t sats;
    int16_t roll_cd;       // 百分之一度
    int16_t pitch_cd;
    uint8_t flags;         // bit0 = 飛機已解鎖, bit1 = MPU 校正中, bit2 = MPU 已校正
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

FixedPID pid_rate_roll, pid_rate_pitch, pid_roll, pid_pitch, pid_yaw;

// ── FixedPID (PlatformIO 函式庫 citycafe578/FixedPID) 轉接 ─────────────
// 函式庫全部用整數：增益 = 實際值 × PID_SCALE (1.5 → 1500)，P、I、D 內部已除回比例，
// 所以輸出單位和誤差單位相同。這裡把角度與輸出都用「千分之一單位」進出以保留解析度，
// 包成「用 double 實際單位進出」的函式，其餘飛控程式碼不用管縮放。
static inline int32_t toFixed(double v) {
    double x = v * PID_SCALE;
    if (x > 2147483000.0) x = 2147483000.0;
    if (x < -2147483000.0) x = -2147483000.0;
    return (int32_t) lround(x);
}

static void applyGains(FixedPID &pid, const AxisPID &g) {
    pid.setTunings(toFixed(g.p), toFixed(g.i), toFixed(g.d));
}

static void setupPid(FixedPID &pid, const AxisPID &g, double limit) {
    applyGains(pid, g);
    int32_t lim = toFixed(limit);              // 輸出限制，積分項也用同樣的上限
    pid.setOutputLimits(-lim, lim);
    pid.setIntegralLimits(-lim, lim);
    pid.setDerivativeOnMeasurement(true);      // D 只看量測值變化，設定值跳動 (含第一次) 不會產生突跳
}

static double runPid(FixedPID &pid, double target, double input, uint32_t dt_us) {
    return (double) pid.update(toFixed(target), toFixed(input), dt_us) / PID_SCALE;
}

int servo_pins[4] = {4, 0, 3, 1};

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
    if (prefs.isKey("mpuData")) { prefs.getBytes("mpuData", &mpuData, sizeof(mpuData)); mpuCalibrated = true; }
    prefs.end();
}

void init_mpu(){
    motorArmed = false; throttle = 1000;
    if (!mpu.begin()) return;
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setGyroRange(MPU6050_RANGE_250_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);   // 與 setup() 一致
    
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
    mpuCalibrated = true;
}

// ==========================================
// ESP-NOW 接收回呼函數
// ==========================================
void OnDataRecv(const uint8_t * mac, const uint8_t *incomingData, int len) {
    if (len == 0) return;
    uint8_t packetType = incomingData[0];

    // 飛行控制
    if (packetType == 0 && len == sizeof(ESPNowControlPacket)) {
        ESPNowControlPacket packet;
        memcpy(&packet, incomingData, sizeof(packet));

        lastRecvTime = millis(); // 更新失控保護計時器

        // 處理特殊指令
        if (packet.cmd == 1) motorArmed = true;
        else if (packet.cmd == 2) { motorArmed = false; throttle = 1000; }
        else if (packet.cmd == 3) { if (!motorArmed) calibrateReq = true; }
        else if (packet.cmd == 4) { if (!motorArmed) { mpuData = {0,0,0,0,0}; save_Mpu_config(); mpuCalibrated = false; } }

        // 更新飛行目標值
        throttle = constrain(packet.throttle, 1000, Flight::SafeThrottle);
        target_roll = constrain(packet.roll, 1000, 2000);
        target_pitch = constrain(packet.pitch, 1000, 2000);
        target_yaw = constrain(packet.yaw, 1000, 2000);
    } 
    // 地面站要求回報 PID (由 TelemetryTask 送出，不在回呼裡送)
    else if (packetType == 3 && len == sizeof(ESPNowRequestPacket)) {
        pidReportReq = true;
    }
    // turning
    else if (packetType == 1 && len == sizeof(ESPNowTunePacket)) {
        ESPNowTunePacket packet;
        memcpy(&packet, incomingData, sizeof(packet));
        String axis = String(packet.axis);

        if (axis == "roll") { rollPID.p = packet.p; rollPID.i = packet.i; rollPID.d = packet.d; applyGains(pid_roll, rollPID); }
        else if (axis == "pitch") { pitchPID.p = packet.p; pitchPID.i = packet.i; pitchPID.d = packet.d; applyGains(pid_pitch, pitchPID); }
        else if (axis == "yaw") { yawPID.p = packet.p; yawPID.i = packet.i; yawPID.d = packet.d; applyGains(pid_yaw, yawPID); }
        else if (axis == "rate_roll") { rate_rollPID.p = packet.p; rate_rollPID.i = packet.i; rate_rollPID.d = packet.d; applyGains(pid_rate_roll, rate_rollPID); }
        else if (axis == "rate_pitch") { rate_pitchPID.p = packet.p; rate_pitchPID.i = packet.i; rate_pitchPID.d = packet.d; applyGains(pid_rate_pitch, rate_pitchPID); }
        
        save_PID_config();
        Serial.printf("Updated %s PID: %.2f %.2f %.2f\n", axis.c_str(), packet.p, packet.i, packet.d);
    }
}

void FlightTask(void *pvParameters) {
    TickType_t xLastWakeTime = xTaskGetTickCount();
    const TickType_t xFrequency = 5 / portTICK_PERIOD_MS; // 200Hz 

    while (true) {
        uint32_t workStart = micros();
        // MPU 校正 (飛機必須靜置、未解鎖)
        if (calibrateReq) {
            calibrateReq = false;
            if (!motorArmed) {
                calibrating = true;
                init_mpu();
                calibrating = false;
                prev_time = 0;
            }
        }
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
            // FixedPID 重置
            pid_roll.reset(); output_roll = 0;
            pid_pitch.reset(); output_pitch = 0;
            pid_yaw.reset(); output_yaw = 0;
            pid_rate_roll.reset(); output_rate_roll = 0;
            pid_rate_pitch.reset(); output_rate_pitch = 0;
        } else {
            if (abs(roll - 90) > 45 || abs(pitch) > 45) motorArmed = false;

            setpoint_roll = constrain((target_roll - 1500) * 0.03, -Flight::MaxTilt, Flight::MaxTilt) + 90;
            setpoint_pitch = constrain((target_pitch - 1500) * 0.03, -Flight::MaxTilt, Flight::MaxTilt);
            setpoint_yaw = constrain((target_yaw - 1500) * 0.12, -Flight::MaxYawRate, Flight::MaxYawRate);

            input_roll = roll; input_pitch = pitch; input_yaw = yaw;
            uint32_t dt_us = (uint32_t) (dt * 1000000.0f);
            output_roll = runPid(pid_roll, setpoint_roll, input_roll, dt_us);
            output_pitch = runPid(pid_pitch, setpoint_pitch, input_pitch, dt_us);
            output_yaw = runPid(pid_yaw, setpoint_yaw, input_yaw, dt_us);

            setpoint_rate_roll = output_roll;
            setpoint_rate_pitch = output_pitch;
            input_rate_roll = gyro_roll_rate;
            input_rate_pitch = -gyro_pitch_rate;

            output_rate_roll = runPid(pid_rate_roll, setpoint_rate_roll, input_rate_roll, dt_us);
            output_rate_pitch = runPid(pid_rate_pitch, setpoint_rate_pitch, input_rate_pitch, dt_us);
        }

        int fl = constrain(throttle + output_rate_roll - output_rate_pitch, 1000, Flight::SafeThrottle);
        int fr = constrain(throttle - output_rate_roll - output_rate_pitch, 1000, Flight::SafeThrottle);
        int bl = constrain(throttle + output_rate_roll + output_rate_pitch, 1000, Flight::SafeThrottle);
        int br = constrain(throttle - output_rate_roll + output_rate_pitch, 1000, Flight::SafeThrottle);

        if (motorArmed) { writeMotorUS(0, fl); writeMotorUS(1, fr); writeMotorUS(2, bl); writeMotorUS(3, br); } 
        else { writeMotorUS(0, 1000); writeMotorUS(1, 1000); writeMotorUS(2, 1000); writeMotorUS(3, 1000); }

        uint32_t workTime = micros() - workStart;
        flightCoreWorkPercent = min<uint32_t>(100, workTime * 100 / 5000);
        vTaskDelayUntil(&xLastWakeTime, xFrequency);
    }
}

// ── Geohash 編碼 (base32) ───────────────────────────────────────
static void geohashEncode(double lat, double lng, int precision, char *out) {
    static const char kBase32[] = "0123456789bcdefghjkmnpqrstuvwxyz";
    double latLo = -90, latHi = 90, lngLo = -180, lngHi = 180;
    bool evenBit = true;
    int bit = 0, ch = 0, n = 0;
    while (n < precision) {
        if (evenBit) {
            double mid = (lngLo + lngHi) / 2;
            if (lng >= mid) { ch = (ch << 1) | 1; lngLo = mid; } else { ch <<= 1; lngHi = mid; }
        } else {
            double mid = (latLo + latHi) / 2;
            if (lat >= mid) { ch = (ch << 1) | 1; latLo = mid; } else { ch <<= 1; latHi = mid; }
        }
        evenBit = !evenBit;
        if (++bit == 5) { out[n++] = kBase32[ch]; bit = 0; ch = 0; }
    }
    out[n] = 0;
}

static const char *const kAxisNames[5] = {"roll", "pitch", "yaw", "rate_roll", "rate_pitch"};
static const AxisPID *const kAxisPids[5] = {&rollPID, &pitchPID, &yawPID, &rate_rollPID, &rate_pitchPID};

// 每 20 ms 讀 GPS；每 200 ms 把姿態 / 解鎖 / GPS / 電池回傳給地面站；被要求時回報 PID
void TelemetryTask(void *pvParameters) {
    int tick = 0;
    while (true) {
        while (GPS_RX_PIN >= 0 && gpsSerial.available()) gps.encode(gpsSerial.read());

        if (pidReportReq) {
            pidReportReq = false;
            for (int k = 0; k < 5; k++) {
                ESPNowPidReportPacket rp;
                memset(&rp, 0, sizeof(rp));
                rp.type = 4;
                strncpy(rp.axis, kAxisNames[k], sizeof(rp.axis) - 1);
                rp.p = kAxisPids[k]->p; rp.i = kAxisPids[k]->i; rp.d = kAxisPids[k]->d;
                esp_now_send(broadcastAddress, (uint8_t *) &rp, sizeof(rp));
                vTaskDelay(pdMS_TO_TICKS(8));
            }
        }

        if (++tick >= 10) {
            tick = 0;
            ESPNowTelemetryPacket pk;
            memset(&pk, 0, sizeof(pk));
            pk.type = 2;
            pk.roll_cd = (int16_t) ((roll - 90.0f) * 100.0f);   // 水平時 roll 約為 90，這裡扣掉
            pk.pitch_cd = (int16_t) (pitch * 100.0f);
            pk.flags = (motorArmed ? 1 : 0) | (calibrating ? 2 : 0) | (mpuCalibrated ? 4 : 0);
            if (GPS_RX_PIN >= 0) {
                pk.sats = gps.satellites.isValid() ? (uint8_t) gps.satellites.value() : 0;
                if (gps.location.isValid() && gps.location.age() < 2000) {
                    geohashEncode(gps.location.lat(), gps.location.lng(), 9, pk.geohash);
                    if (gps.course.isValid()) pk.heading = (int16_t) gps.course.deg();
                    if (gps.altitude.isValid()) pk.alt_cm = (int16_t) constrain(gps.altitude.meters() * 100.0, -32000, 32000);
                    if (gps.speed.isValid()) pk.speed_cms = (uint16_t) constrain(gps.speed.mps() * 100.0, 0, 65000);
                }
            }
            if (BATTERY_ADC_PIN >= 0) pk.battery_mv = (uint16_t) (analogReadMilliVolts(BATTERY_ADC_PIN) * BATTERY_DIVIDER);
            esp_now_send(broadcastAddress, (uint8_t *) &pk, sizeof(pk));
        }
        vTaskDelay(pdMS_TO_TICKS(20));
    }
}

void SystemMonitorTask(void *pvParameters) {
    while (true) {
        Serial.printf(
            "\n[System] HEAP free=%u min=%u | PSRAM free=%u total=%u | Core work=%u%%\n",
            ESP.getFreeHeap(),
            ESP.getMinFreeHeap(),
            heap_caps_get_free_size(MALLOC_CAP_SPIRAM),
            heap_caps_get_total_size(MALLOC_CAP_SPIRAM),
            flightCoreWorkPercent);
        Serial.printf("[Task] FlightTask      stack_left=%u bytes\n",
                      uxTaskGetStackHighWaterMark(flightTaskHandle) * sizeof(StackType_t));
        Serial.printf("[Task] SystemMonitor   stack_left=%u bytes\n",
                      uxTaskGetStackHighWaterMark(systemMonitorTaskHandle) * sizeof(StackType_t));
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

void setup() {
    Serial.begin(115200);
    delay(5000);
    Serial.println("\n=== DRONE BOOT (ESP-NOW + FixedPID) ===");

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
    esp_now_peer_info_t peer = {};
    memcpy(peer.peer_addr, broadcastAddress, 6);
    peer.channel = 1;
    peer.encrypt = false;
    esp_now_add_peer(&peer);   // 回傳遙測用的廣播對象
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

    // 載入 FixedPID 設定與參數 (輸出範圍與原本相同)
    setupPid(pid_rate_roll, rate_rollPID, 400);
    setupPid(pid_rate_pitch, rate_pitchPID, 400);
    setupPid(pid_roll, rollPID, 90);
    setupPid(pid_pitch, pitchPID, 90);
    setupPid(pid_yaw, yawPID, 100);

    if (GPS_RX_PIN >= 0) gpsSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
    xTaskCreate(TelemetryTask, "Telemetry", 4096, NULL, 1, NULL);
    xTaskCreate(SystemMonitorTask, "SystemMonitor", 4096, NULL, 1, &systemMonitorTaskHandle);
}

void loop() { vTaskDelete(NULL); }