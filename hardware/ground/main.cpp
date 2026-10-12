#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <Preferences.h>
#include <esp_now.h>
#include "esp_wifi.h"
#include "web.h"
#include "serial_link.h"

const char *ssid = "Drone_GCS_Relay";
const char *password = "abalaba123";
WebServer server(80);
WebSocketsServer webSocket(81);

Preferences prefs;


volatile bool motorArmed = false;
int throttle = 1000;
unsigned long lastRecvTime = 0;

AxisPID rate_rollPID = {0,0,0}, rate_pitchPID = {0,0,0}, rate_yawPID = {0,0,0};
AxisPID rollPID = {0,0,0}, pitchPID = {0,0,0}, yawPID = {0,0,0};

namespace Flight{
  constexpr int SafeThrottle = 1400;
}

// ESPNOW
#pragma pack(1)
struct ESPNowControlPacket{ // Fly Data
    uint8_t type = 0;
    uint16_t throttle;
    int16_t roll;
    int16_t pitch;
    int16_t yaw;
    int16_t cmd;
};

struct ESPNowTelemetryPacket{ // 飛機 -> 地面站 (type = 2)；欄位定義見 docs/telemetry-protocol.md
    uint8_t type;          // 固定 2
    char geohash[12];      // 沒有定位時整個為 0
    int16_t heading;       // 度 (0=北, 順時針)
    int16_t alt_cm;        // 公分
    uint16_t speed_cms;    // 公分/秒
    uint16_t battery_mv;   // 毫伏
    uint8_t sats;
    int16_t roll_cd;       // 百分之一度
    int16_t pitch_cd;
    uint8_t flags;         // bit0 = 飛機已解鎖
};

struct ESPNowTunePacket{ // Turning Data
    uint8_t type = 1;
    char axis[16];
    float p;
    float i;
    float d;
};
#pragma pack()

// MAC (暫時是廣播)
uint8_t droneAddress[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF}; 
esp_now_peer_info_t peerInfo = {};


void save_PID_config(){
    prefs.begin("PIDs", false);
    prefs.putBytes("rate_rollPID", &rate_rollPID, sizeof(rate_rollPID));
    prefs.putBytes("rate_pitchPID", &rate_pitchPID, sizeof(rate_pitchPID));
    prefs.putBytes("rollPID", &rollPID, sizeof(rollPID));
    prefs.putBytes("pitchPID", &pitchPID, sizeof(pitchPID));
    prefs.putBytes("yawPID", &yawPID, sizeof(yawPID));
    prefs.end();
}

void load_PID_config(){
    prefs.begin("PIDs", false); 
    if (prefs.isKey("rollPID")) {
        prefs.getBytes("rate_rollPID", &rate_rollPID, sizeof(rate_rollPID));
        prefs.getBytes("rate_pitchPID", &rate_pitchPID, sizeof(rate_pitchPID));
        prefs.getBytes("rollPID", &rollPID, sizeof(rollPID));
        prefs.getBytes("pitchPID", &pitchPID, sizeof(pitchPID));
        prefs.getBytes("yawPID", &yawPID, sizeof(yawPID));
    } else {
        prefs.putBytes("rate_rollPID", &rate_rollPID, sizeof(rate_rollPID));
        prefs.putBytes("rate_pitchPID", &rate_pitchPID, sizeof(rate_pitchPID));
        prefs.putBytes("rollPID", &rollPID, sizeof(rollPID));
        prefs.putBytes("pitchPID", &pitchPID, sizeof(pitchPID));
        prefs.putBytes("yawPID", &yawPID, sizeof(yawPID));
    }
    prefs.end();
}

void sendCommandToDrone(int16_t cmdCode){
    ESPNowControlPacket packet;
    packet.type = 0;
    packet.throttle = 1000;
    packet.roll = 1500;
    packet.pitch = 1500;
    packet.yaw = 1500;
    packet.cmd = cmdCode;
    esp_now_send(droneAddress, (uint8_t *) &packet, sizeof(packet));
}





// ==========================================================
// 接收：飛機 (ESP-NOW) 與 電腦 (USB 序列)
// ==========================================================
volatile unsigned long lastDroneRxMs = 0;
volatile bool droneSeen = false;
volatile uint8_t droneFlags = 0;
volatile int16_t droneRollCd = 0, dronePitchCd = 0;
volatile uint16_t droneBatMv = 0;
ESPNowTelemetryPacket pendingTelem;
volatile bool telemPending = false;

gcs::FrameParser serialParser;
unsigned long lastStatusMs = 0;

// 在 WiFi 任務裡執行：只存資料，格式化 / 印出留給 loop()。
void OnDataRecv(const uint8_t *mac, const uint8_t *data, int len) {
    if (len != (int)sizeof(ESPNowTelemetryPacket) || data[0] != 2) return;
    ESPNowTelemetryPacket pk;
    memcpy(&pk, data, sizeof(pk));
    droneFlags = pk.flags;
    droneRollCd = pk.roll_cd;
    dronePitchCd = pk.pitch_cd;
    droneBatMv = pk.battery_mv;
    pendingTelem = pk;
    telemPending = true;
    lastDroneRxMs = millis();
    droneSeen = true;
}

// 給電腦：GEO,<geohash>,<heading>,<alt m>,<speed m/s>,<battery V>,<sats>
void forwardTelemetry(const ESPNowTelemetryPacket &t) {
    if (!gcs::isGeohash(t.geohash, sizeof(t.geohash))) return;  // 沒定位就不送位置
    char gh[13];
    memcpy(gh, t.geohash, 12);
    gh[12] = 0;
    Serial.printf("GEO,%s,%d,%.2f,%.2f,%.2f,%u\n", gh, (int)t.heading, t.alt_cm / 100.0f,
                  t.speed_cms / 100.0f, t.battery_mv / 1000.0f, (unsigned)t.sats);
}

// 給電腦：STATUS,<地面站已解鎖>,<距上次收到飛機 ms (-1=從未)>,<飛機已解鎖 (-1=未知)>,<roll>,<pitch>,<電池 V>
void sendStatus() {
    long age = droneSeen ? (long)(millis() - lastDroneRxMs) : -1;
    int droneArmed = droneSeen ? (droneFlags & 1) : -1;
    Serial.printf("STATUS,%d,%ld,%d,%.2f,%.2f,%.2f\n", motorArmed ? 1 : 0, age, droneArmed,
                  droneRollCd / 100.0f, dronePitchCd / 100.0f, droneBatMv / 1000.0f);
}

AxisPID *axisByName(const char *axis) {
    if (!strcmp(axis, "roll")) return &rollPID;
    if (!strcmp(axis, "pitch")) return &pitchPID;
    if (!strcmp(axis, "yaw")) return &yawPID;
    if (!strcmp(axis, "rate_roll")) return &rate_rollPID;
    if (!strcmp(axis, "rate_pitch")) return &rate_pitchPID;
    return nullptr;
}

void printPid() {
    const struct { const char *name; const AxisPID *pid; } rows[] = {
        {"roll", &rollPID}, {"pitch", &pitchPID}, {"yaw", &yawPID},
        {"rate_roll", &rate_rollPID}, {"rate_pitch", &rate_pitchPID},
    };
    for (auto &r : rows) Serial.printf("PID,%s,%.6f,%.6f,%.6f\n", r.name, r.pid->p, r.pid->i, r.pid->d);
}

void applyTune(const gcs::TuneCmd &t) {
    AxisPID *pid = axisByName(t.axis);
    if (!pid) return;
    pid->p = t.p; pid->i = t.i; pid->d = t.d;
    save_PID_config();
    ESPNowTunePacket pk;
    pk.type = 1;
    memset(pk.axis, 0, sizeof(pk.axis));
    strncpy(pk.axis, t.axis, sizeof(pk.axis) - 1);
    pk.p = t.p; pk.i = t.i; pk.d = t.d;
    esp_now_send(droneAddress, (uint8_t *) &pk, sizeof(pk));
}

// 電腦送來的控制幀。ARM / KILL 以 cmd 表示，ground 是「已解鎖」狀態的唯一依據。
void handleSerialControl(const gcs::ControlCmd &c) {
    if ((c.cmd == 3 || c.cmd == 4) && motorArmed) return;  // 已解鎖不得校正
    if (c.cmd == 1) motorArmed = true;
    else if (c.cmd == 2) motorArmed = false;

    lastRecvTime = millis();  // 與手機 WebSocket 共用同一個失聯保護 (WifiTask 超過 1 秒沒訊號就 KILL)
    throttle = motorArmed ? constrain((int)c.throttle, 1000, Flight::SafeThrottle) : 1000;
    if (!motorArmed && c.cmd == 0) return;  // 未解鎖時一般控制不轉發

    ESPNowControlPacket out;
    out.type = 0;
    out.throttle = throttle;
    out.roll = constrain((int)c.roll, 1000, 2000);
    out.pitch = constrain((int)c.pitch, 1000, 2000);
    out.yaw = constrain((int)c.yaw, 1000, 2000);
    out.cmd = c.cmd;
    esp_now_send(droneAddress, (uint8_t *) &out, sizeof(out));
}

void handleSerialFrame(const gcs::Frame &f) {
    switch (f.type) {
        case gcs::kControl: { gcs::ControlCmd c; if (gcs::parseControl(f, c)) handleSerialControl(c); break; }
        case gcs::kTune:    { gcs::TuneCmd t;    if (gcs::parseTune(f, t)) applyTune(t); break; }
        case gcs::kGetPid:  printPid(); break;
        default: break;
    }
}

// WebSocket
void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length){
    if (type == WStype_BIN && length == 10){
        // 從 payload 提取手機端發送的資料
        uint16_t raw_throttle = payload[0] | (payload[1] << 8);
        int16_t raw_roll = payload[2] | (payload[3] << 8);
        int16_t raw_pitch = payload[4] | (payload[5] << 8);
        int16_t raw_yaw = payload[6] | (payload[7] << 8);
        
        throttle = constrain(raw_throttle, 1000, Flight::SafeThrottle);
        lastRecvTime = millis();

        if (motorArmed){
            ESPNowControlPacket outPacket;
            outPacket.type = 0;
            outPacket.throttle = throttle;
            outPacket.roll = constrain(raw_roll, 1000, 2000);
            outPacket.pitch = constrain(raw_pitch, 1000, 2000);
            outPacket.yaw = constrain(raw_yaw, 1000, 2000);
            outPacket.cmd = 0; // 正常飛行
            
            esp_err_t result = esp_now_send(
                droneAddress,
                (uint8_t *)&outPacket,
                sizeof(outPacket)
            );

            Serial.printf(
                "ESP-NOW send result = %d, size = %d\n",
                result,
                sizeof(outPacket)
            );
        }
    } 
}

void WifiTask(void *pvParameters){
    while (true) {
        server.handleClient();
        webSocket.loop();
        
        // 防失控
        if (motorArmed && (millis() - lastRecvTime > 1000)){
            motorArmed = false;
            throttle = 1000;
            sendCommandToDrone(2); // cmd = 2 (KILL)
            Serial.println("Phone connection timeout! Sent KILL to drone.");
        }
        vTaskDelay(10 / portTICK_PERIOD_MS);
    }
}

void setup(){
    Serial.begin(115200);
    delay(300);
    Serial.println("\n=== GROUND STATION (ESP-NOW Relay) ===");

    // AP
    WiFi.persistent(false);
    WiFi.mode(WIFI_AP);
    // 強制指定 Channel (ESP-NOW 兩端必須在同一個 Channel)
    WiFi.softAP(ssid, password, 1, 0, 4); 
    esp_wifi_set_max_tx_power(78); // 地面站可以火力全開
    Serial.println("GCS IP: " + WiFi.softAPIP().toString());

    // 2. 初始化 ESP-NOW
    if (esp_now_init() != ESP_OK) {
        Serial.println("Error initializing ESP-NOW");
        return;
    }
    esp_now_register_recv_cb(OnDataRecv);  // 接收飛機回傳
    
    // 註冊對接飛機
    memset(&peerInfo, 0, sizeof(peerInfo));

    memcpy(peerInfo.peer_addr, droneAddress, 6);
    peerInfo.channel = 1;
    peerInfo.encrypt = false;
    peerInfo.ifidx = WIFI_IF_AP;

    esp_err_t peerResult = esp_now_add_peer(&peerInfo);

    Serial.printf("esp_now_add_peer result = %d\n", peerResult);

    if (peerResult != ESP_OK) {
        Serial.println("Failed to add peer");
        return;
    }

    // 載入本地快取 PID
    load_PID_config();

    // HTTP 路由
    server.on("/", []() { server.send(200, "text/html", getControlHTML()); });
    server.on("/favicon.ico", []() { server.send(204, "text/plain", ""); });
    server.on("/tune", []() { server.send(200, "text/html", getTuneHTML()); });
    
    server.on("/kill", []() { 
        motorArmed = false; throttle = 1000; 
        sendCommandToDrone(2); // 傳送 KILL
        server.send(200, "text/plain", "KILLED"); 
    });
    
    server.on("/arm", []() { 
        motorArmed = true; lastRecvTime = millis(); 
        sendCommandToDrone(1); // 傳送 ARM
        server.send(200, "text/plain", "ARMED"); 
    });
    
    server.on("/mpu", []() {
        if (motorArmed) { server.send(200, "text/plain", "ERROR"); return; }
        sendCommandToDrone(3); // 傳送 校正MPU
        server.send(200, "text/plain", "OK");
    });

    server.on("/clearMpu", []() {
        if (motorArmed) { server.send(200, "text/plain", "ERROR"); return; }
        sendCommandToDrone(4); // 傳送 清除MPU
        server.send(200, "text/plain", "OK");
    });

    // 收到更新後傳送封包
    server.on("/update", []() {
        String axis = server.arg("axis");
        String param = server.arg("param");
        float val = atof(server.arg("value").c_str());

        // 更新快取
        if (axis == "roll"){
            if (param == "p") rollPID.p = val; else if (param == "i") rollPID.i = val; else if (param == "d") rollPID.d = val;
        } else if (axis == "pitch"){
            if (param == "p") pitchPID.p = val; else if (param == "i") pitchPID.i = val; else if (param == "d") pitchPID.d = val;
        } else if (axis == "yaw"){
            if (param == "p") yawPID.p = val; else if (param == "i") yawPID.i = val; else if (param == "d") yawPID.d = val;
        } else if (axis == "rate_roll"){
            if (param == "p") rate_rollPID.p = val; else if (param == "i") rate_rollPID.i = val; else if (param == "d") rate_rollPID.d = val;
        } else if (axis == "rate_pitch"){
            if (param == "p") rate_pitchPID.p = val; else if (param == "i") rate_pitchPID.i = val; else if (param == "d") rate_pitchPID.d = val;
        }
        save_PID_config();

        // truning 封包
        ESPNowTunePacket tunePacket;
        tunePacket.type = 1;
        strncpy(tunePacket.axis, axis.c_str(), sizeof(tunePacket.axis) - 1);
        tunePacket.axis[sizeof(tunePacket.axis) - 1] = '\0';
        
        // 抓取當前該軸的完整 PID
        if (axis == "roll") { tunePacket.p = rollPID.p; tunePacket.i = rollPID.i; tunePacket.d = rollPID.d; }
        else if (axis == "pitch") { tunePacket.p = pitchPID.p; tunePacket.i = pitchPID.i; tunePacket.d = pitchPID.d; }
        else if (axis == "yaw") { tunePacket.p = yawPID.p; tunePacket.i = yawPID.i; tunePacket.d = yawPID.d; }
        else if (axis == "rate_roll") { tunePacket.p = rate_rollPID.p; tunePacket.i = rate_rollPID.i; tunePacket.d = rate_rollPID.d; }
        else if (axis == "rate_pitch") { tunePacket.p = rate_pitchPID.p; tunePacket.i = rate_pitchPID.i; tunePacket.d = rate_pitchPID.d; }
        
        esp_now_send(droneAddress, (uint8_t *) &tunePacket, sizeof(tunePacket));
        Serial.printf("Sent Tune Packet: %s P:%.2f I:%.2f D:%.2f\n", tunePacket.axis, tunePacket.p, tunePacket.i, tunePacket.d);

        server.send(200, "text/plain", "OK");
    });

    server.begin();
    webSocket.begin();
    webSocket.onEvent(webSocketEvent);
    xTaskCreatePinnedToCore(WifiTask, "WifiTask", 10240, NULL, 1, NULL, 0);
}

void loop() {
    // 電腦 -> 地面站 (USB 序列)
    gcs::Frame frame;
    while (Serial.available()) {
        if (serialParser.push((uint8_t) Serial.read(), frame)) handleSerialFrame(frame);
    }

    // 飛機 -> 地面站 -> 電腦
    if (telemPending) {
        telemPending = false;
        ESPNowTelemetryPacket pk = pendingTelem;
        forwardTelemetry(pk);
    }
    if (millis() - lastStatusMs >= 500) {
        lastStatusMs = millis();
        sendStatus();
    }
    delay(1);
}