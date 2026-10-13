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


bool motorArmed = false;
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

struct ESPNowRequestPacket{ // 地面站 -> 飛機：type 3 = 請回報目前 PID
    uint8_t type = 3;
};

struct ESPNowPidReportPacket{ // 飛機 -> 地面站：type 4 = 單一軸的 PID
    uint8_t type;
    char axis[16];
    float p;
    float i;
    float d;
};

struct ESPNowTunePacket{ // Turning Data
    uint8_t type = 1;
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
    uint8_t flags;         // bit0 = 飛機已解鎖
};
#pragma pack()

// 飛機回傳的狀態 (在 ESP-NOW 回呼裡寫入，在 loop() 裡讀取)
volatile unsigned long lastDroneRxMs = 0;   // 0 = 還沒收過
volatile int8_t droneArmed = -1;            // -1 未知, 0 鎖定, 1 已解鎖
volatile float droneRoll = 0, dronePitch = 0, droneBattery = 0;
volatile bool telemPending = false;
ESPNowTelemetryPacket pendingTelem;

volatile uint8_t droneFlags = 0;            // bit0 解鎖, bit1 MPU 校正中, bit2 MPU 已校正

// 飛機回報的 PID：回呼寫入快取，同時放進佇列由 loop() 轉給電腦
struct PidReport { char axis[17]; float p, i, d; };
PidReport pidQueue[8];
volatile uint8_t pidQHead = 0, pidQTail = 0;
volatile uint8_t pidReceivedMask = 0;        // 每個 bit 對應一個軸，收齊 = 31
unsigned long pidWaitDeadline = 0;           // 序列 GET_PID 等飛機回覆到這個時間，逾時就用快取補

// 要送給電腦的文字行：同時寫到 USB 序列與 WebSocket (WebSocket 由 WifiTask 送出，避免跨核心操作)
SemaphoreHandle_t outMutex = nullptr;
String wsOut;

gcs::FrameParser serialParser;
unsigned long lastStatusMs = 0;

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





AxisPID *axisByName(const char *axis){
    if (!strcmp(axis, "roll")) return &rollPID;
    if (!strcmp(axis, "pitch")) return &pitchPID;
    if (!strcmp(axis, "yaw")) return &yawPID;
    if (!strcmp(axis, "rate_roll")) return &rate_rollPID;
    if (!strcmp(axis, "rate_pitch")) return &rate_pitchPID;
    return nullptr;
}

// 更新地面站快取 + 轉送給飛機 (電腦端的 TUNE 幀用)
bool applyTune(const char *axis, float p, float i, float d){
    AxisPID *pid = axisByName(axis);
    if (!pid) return false;
    pid->p = p; pid->i = i; pid->d = d;
    save_PID_config();
    ESPNowTunePacket pk;
    pk.type = 1;
    memset(pk.axis, 0, sizeof(pk.axis));
    strncpy(pk.axis, axis, sizeof(pk.axis) - 1);
    pk.p = p; pk.i = i; pk.d = d;
    esp_now_send(droneAddress, (uint8_t *) &pk, sizeof(pk));
    return true;
}

const char *const kAxisNames[5] = {"roll", "pitch", "yaw", "rate_roll", "rate_pitch"};

int axisIndex(const char *axis){
    for (int k = 0; k < 5; k++) if (!strcmp(axis, kAxisNames[k])) return k;
    return -1;
}

// ESP-NOW 接收：飛機回傳遙測 (type 2)
void onEspNowRecv(const uint8_t *mac, const uint8_t *data, int len){
    if (len == sizeof(ESPNowPidReportPacket) && data[0] == 4){
        ESPNowPidReportPacket rp;
        memcpy(&rp, data, sizeof(rp));
        rp.axis[sizeof(rp.axis) - 1] = 0;
        int k = axisIndex(rp.axis);
        if (k < 0) return;
        AxisPID *pid = axisByName(rp.axis);
        pid->p = rp.p; pid->i = rp.i; pid->d = rp.d;      // 以飛機實際的值更新快取
        pidReceivedMask |= (1 << k);
        uint8_t next = (pidQHead + 1) % 8;
        if (next != pidQTail){
            PidReport &q = pidQueue[pidQHead];
            memcpy(q.axis, rp.axis, 16); q.axis[16] = 0;
            q.p = rp.p; q.i = rp.i; q.d = rp.d;
            pidQHead = next;
        }
        return;
    }
    if (len != sizeof(ESPNowTelemetryPacket) || data[0] != 2) return;
    memcpy(&pendingTelem, data, sizeof(pendingTelem));
    const ESPNowTelemetryPacket &t = pendingTelem;
    droneRoll = t.roll_cd / 100.0f;
    dronePitch = t.pitch_cd / 100.0f;
    droneBattery = t.battery_mv / 1000.0f;
    droneArmed = (t.flags & 1) ? 1 : 0;
    droneFlags = t.flags;
    lastDroneRxMs = millis();
    telemPending = true;
}

void emitLine(const char *line){
    Serial.println(line);
    if (outMutex && xSemaphoreTake(outMutex, 0) == pdTRUE){
        if (wsOut.length() < 1024){ wsOut += line; wsOut += '\n'; }
        xSemaphoreGive(outMutex);
    }
}

// 把遙測轉成 GEO 文字行給電腦 (沒有定位就不送，狀態由 STATUS 回報)
void forwardTelemetry(const ESPNowTelemetryPacket &t){
    char gh[13];
    memcpy(gh, t.geohash, 12);
    gh[12] = 0;
    if (!gcs::isGeohash(gh, 12)) return;
    char line[96];
    snprintf(line, sizeof(line), "GEO,%s,%d,%.2f,%.2f,%.2f,%u", gh, t.heading, t.alt_cm / 100.0f, t.speed_cms / 100.0f, t.battery_mv / 1000.0f, t.sats);
    emitLine(line);
}

// 每 0.5 秒回報給電腦：地面站解鎖、飛機最後回應幾 ms 前、飛機解鎖、roll、pitch、電池、飛機旗標
void sendStatus(){
    long age = lastDroneRxMs ? (long) (millis() - lastDroneRxMs) : -1;
    char line[96];
    snprintf(line, sizeof(line), "STATUS,%d,%ld,%d,%.1f,%.1f,%.2f,%u", motorArmed ? 1 : 0, age, (int) droneArmed, droneRoll, dronePitch, droneBattery, (unsigned) droneFlags);
    emitLine(line);
}

void emitPidLine(int k){
    AxisPID *p = axisByName(kAxisNames[k]);
    char line[96];
    snprintf(line, sizeof(line), "PID,%s,%.4f,%.4f,%.4f", kAxisNames[k], p->p, p->i, p->d);
    emitLine(line);
}

// 向飛機要目前的 PID；飛機會用 type 4 封包逐軸回覆
void requestDronePid(){
    pidReceivedMask = 0;
    ESPNowRequestPacket rq;
    esp_now_send(droneAddress, (uint8_t *) &rq, sizeof(rq));
}

// 電腦 -> 地面站 的序列幀
void handleSerialFrame(const gcs::Frame &f){
    if (f.type == gcs::kControl){
        gcs::ControlCmd c;
        if (!gcs::parseControl(f, c)) return;
        lastRecvTime = millis();
        switch (c.cmd){
            case 1: motorArmed = true; sendCommandToDrone(1); return;
            case 2: motorArmed = false; throttle = 1000; sendCommandToDrone(2); return;
            case 3: if (!motorArmed) sendCommandToDrone(3); return;
            case 4: if (!motorArmed) sendCommandToDrone(4); return;
            default: break;
        }
        throttle = constrain((int) c.throttle, 1000, Flight::SafeThrottle);
        if (motorArmed){
            ESPNowControlPacket pk;
            pk.type = 0;
            pk.throttle = throttle;
            pk.roll = constrain((int) c.roll, 1000, 2000);
            pk.pitch = constrain((int) c.pitch, 1000, 2000);
            pk.yaw = constrain((int) c.yaw, 1000, 2000);
            pk.cmd = 0;
            esp_now_send(droneAddress, (uint8_t *) &pk, sizeof(pk));
        }
    } else if (f.type == gcs::kTune){
        gcs::TuneCmd t;
        if (gcs::parseTune(f, t)) applyTune(t.axis, t.p, t.i, t.d);
    } else if (f.type == gcs::kGetPid){
        requestDronePid();
        pidWaitDeadline = millis() + 600;
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
            (void) result;
        }
    } 
}

void WifiTask(void *pvParameters){
    while (true) {
        server.handleClient();
        webSocket.loop();

        // 把 GEO / STATUS / PID 文字行推給 Wi‑Fi 連線的電腦
        if (outMutex && xSemaphoreTake(outMutex, 0) == pdTRUE){
            String pending = wsOut;
            wsOut = "";
            xSemaphoreGive(outMutex);
            if (pending.length() && webSocket.connectedClients() > 0) webSocket.broadcastTXT(pending);
        }
        
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
    outMutex = xSemaphoreCreateMutex();

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
    
    esp_now_register_recv_cb(onEspNowRecv);

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
    
    // 向飛機要實際的 PID，等最多 0.7 秒；沒收齊的軸用地面站快取補上。回傳 PID,軸,p,i,d 文字行
    server.on("/pid", []() {
        requestDronePid();
        unsigned long t0 = millis();
        while (pidReceivedMask != 31 && millis() - t0 < 700) delay(10);
        String body;
        char line[96];
        for (int k = 0; k < 5; k++){
            AxisPID *p = axisByName(kAxisNames[k]);
            snprintf(line, sizeof(line), "PID,%s,%.4f,%.4f,%.4f\n", kAxisNames[k], p->p, p->i, p->d);
            body += line;
        }
        server.send(200, "text/plain", body);
    });

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
    // 電腦 (USB 序列) 的控制 / 調參 / 讀 PID 指令
    gcs::Frame frame;
    while (Serial.available()){
        if (serialParser.push((uint8_t) Serial.read(), frame)) handleSerialFrame(frame);
    }
    // 飛機回傳的遙測轉給電腦
    if (telemPending){
        telemPending = false;
        ESPNowTelemetryPacket pk = pendingTelem;
        forwardTelemetry(pk);
    }
    // 飛機回報的 PID 轉給電腦；逾時沒收齊的軸用快取補上，電腦端才不會一直等
    while (pidQTail != pidQHead){
        PidReport &q = pidQueue[pidQTail];
        char line[96];
        snprintf(line, sizeof(line), "PID,%s,%.4f,%.4f,%.4f", q.axis, q.p, q.i, q.d);
        emitLine(line);
        pidQTail = (pidQTail + 1) % 8;
    }
    if (pidWaitDeadline && (long) (millis() - pidWaitDeadline) >= 0){
        pidWaitDeadline = 0;
        for (int k = 0; k < 5; k++) if (!(pidReceivedMask & (1 << k))) emitPidLine(k);
    }
    if (millis() - lastStatusMs >= 500){
        lastStatusMs = millis();
        sendStatus();
    }
    delay(1);
}