#include "esp_wifi.h"
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <AutoPID.h>
#include <ESP32Servo.h>
#include <Preferences.h>
#include <RF24.h>
#include <SPI.h>
#include <WebServer.h>
#include <WiFi.h>
#include <Wire.h>

#define SCK 4
#define MISO 5
#define MOSI 6
#define CSN 7
#define CE 10

const char *ssid = "Drone_PID_Config";
const char *password = "abalaba123";
WebServer server(80);
int client_count = 0;

bool motorArmed = false;
int throttle = 1000;
unsigned long lastLoopTime = 0;
bool isCalibrating = false;
unsigned long calibrationStartTime = 0;

Preferences prefs;

// PID structs
struct AxisPID {
  double p, i, d;
};
AxisPID rollPID = {0.0, 0.0, 0.0};
AxisPID pitchPID = {0.0, 0.0, 0.0};
AxisPID yawPID = {0.0, 0.0, 0.0};

// Mpu struct
struct MpuData {
  float roll_off, pitch_off, gyro_x_off, gyro_y_off, gyro_z_off;
};
MpuData mpuData = {0.0, 0.0, 0.0, 0.0, 0.0};

String getHTML() {
  String html = R"=====(
    <!DOCTYPE html>
    <html lang = "zh-TW">
    <head>
        <meta charset = "UTF-8">
        <meta name = "viewport" content = "width=device-width, initial-scale = 1.0, user-scalable = no">
        <title>Drone WiFi Throttle</title>
        <style>
            :root { --bg-color: #1a1a1a; --card-bg: #2d2d2d; --text-color: #eee; --accent-color: #3498db; }
            body { font-family: sans-serif; background-color: var(--bg-color); color: var(--text-color); display: flex; flex-direction: column; align-items: center; padding: 10px; margin: 0; user-select: none; }
            h2 { margin-bottom: 10px; color: var(--accent-color); }
            .card { background-color: var(--card-bg); padding: 20px; border-radius: 15px; width: 100%; max-width: 400px; margin-bottom: 15px; box-sizing: border-box; }
            select, input { width: 100%; padding: 10px; margin-bottom: 10px; border-radius: 8px; border: 1px solid #444; background-color: #1e1e1e; color: white; font-size: 16px; box-sizing: border-box; }
            button { width: 48%; padding: 15px; border: none; border-radius: 8px; font-size: 18px; font-weight: bold; cursor: pointer; margin-top: 5px; color: white;}
            .btn-danger { background-color: #e74c3c; width: 100%; height: 60px; font-size: 24px; box-shadow: 0 0 15px rgba(231, 76, 60, 0.5); }
            .btn-arm { background-color: #27ae60; }
            .btn-disarm { background-color: #7f8c8d; }
            input[type=range] { -webkit-appearance: none; height: 40px; background: #444; border-radius: 20px; }
            input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 40px; height: 40px; background: #f1c40f; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.5); }
            table { width: 100%; border-collapse: collapse; margin-top: 5px; background-color: #222; border-radius: 8px; }
            th, td { padding: 10px; border: 1px solid #444; text-align: center; }
            th { background-color: #333; color: var(--accent-color); }
        </style>
        <script>
            function setThrottle(val){
                document.getElementById('thrDisp').innerText = val + '%';
                fetch('/set_throttle?val=' + val).catch(e => console.log(e));
            }

            function resetThrottle(){
                document.getElementById('thrSlider').value = 0;
                setThrottle(0);
            }

            function emergencyStop(){fetch('/kill'); resetThrottle(); alert('已緊急鎖定');}

            function armMotors(){ 
                if(document.getElementById('thrSlider').value > 5){
                    alert("請先將油門拉到 0% 再解鎖");
                }else{
                    fetch('/arm'); 
                    alert('馬達已解鎖'); 
                }
            }

            function initMpu(){
                const btn = document.getElementById('calBtn');
                const throttle = document.getElementById('thrSlider').value;
                if(throttle > 5){
                    alert('請先將油門拉到 0% 再進行校準');
                    return;
                }
                fetch('/mpu');
            }

            function clearMpu(){
              const btn = document.getElementById('resetBtn');
                const throttle = document.getElementById('thrSlider').value;
                if(throttle > 5){
                    alert('請先將油門拉到 0% 再進行重制');
                    return;
                }                
                fetch('/clearMpu');
            }

            function checkAxisInput(){
                const axis = document.getElementById('axis');
                if(axis == null){
                    alert('請先選擇欲調整的軸向');
                    return;
                }
            }

            function checkParamInput(){
                const param = document.getElementById('param');
                if(param == null){
                    alert('請先選擇欲調整的數值');
                    return;
                }
            }

        </script>
    </head>
    <body>
        <h2>WiFi Throttle Control</h2>
        <div class = "card" style = "border: 2px solid #f1c40f;">
            <h3>Throttle</h3>
            <div style=  "display: flex; justify-content: space-between; margin-bottom: 10px;">
                <button class = "btn-arm" onclick = "armMotors()">解鎖</button>
                <button class = "btn-disarm" onclick = "fetch('/kill')">鎖定</button>
            </div>
            <hr style = "border-color: #444; margin: 15px 0;">
            <label style = "font-size:20px; font-weight: bold;">油門<span id = "thrDisp" style = "color: #f1c40f">%THR_VAL%%</span></label>
            <input type = "range" id = "thrSlider" min = "0" max = "100" value="%THR_VAL%" oninput="setThrottle(this.value)">
            <button class = "btn-danger" onclick = "emergencyStop()" style = "margin-top:20px;">緊急停機</button>
        </div>
        <div class = "card">
            <form action = "/update" method = "GET">
                <h3>PID</h3>
                <select name = "axis" id = "axis">
                    <option value = null>請選擇</option>
                    <option value = "roll">Roll</option>
                    <option value = "pitch">Pitch</option>
                    <option value = "yaw">Yaw</option>
                </select>
                <select name = "param" id = "param">
                    <option value  = null>請選擇</option>
                    <option value = "p">P</option>
                    <option value = "i">I</option>
                    <option value = "d">D</option>
                </select>
                <input type = "number" name = "value" step = "0.00001" inputmode = "decimal" placeholder = "數值" required>
                <button type = "submit" style="background:#3498db; width: 100%;">更新參數</button>
            </form>
        </div>
        <div class = "card">
            <table>
                <thead>
                    <tr>
                        <th>軸</th>
                        <th>P</th>
                        <th>I</th>
                        <th>D</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Roll</td>
                        <td>%ROLL_P%</td>
                        <td>%ROLL_I%</td>
                        <td>%ROLL_D%</td>
                    </tr>
                    <tr>
                        <td>Pitch</td>
                        <td>%PITCH_P%</td>
                        <td>%PITCH_I%</td>
                        <td>%PITCH_D%</td>
                    </tr>
                    <tr>
                        <td>Yaw</td>
                        <td>%YAW_P%</td>
                        <td>%YAW_I%</td>
                        <td>%YAW_D%</td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div style = "display: flex; justify-content: space-between; margin-bottom: 10px;">
            <button class = "btn-arm" onclick = "initMpu()" id = "calBtn">陀螺儀校正</button>
            <button class = "btn-arm" onclick = "clearMpu()" id = "resetBtn">陀螺儀重制</button>
        </div>
    </body>
    </html>
    )=====";

  html.replace("%ROLL_P%", String(rollPID.p));
  html.replace("%ROLL_I%", String(rollPID.i));
  html.replace("%ROLL_D%", String(rollPID.d));
  html.replace("%PITCH_P%", String(pitchPID.p));
  html.replace("%PITCH_I%", String(pitchPID.i));
  html.replace("%PITCH_D%", String(pitchPID.d));
  html.replace("%YAW_P%", String(yawPID.p));
  html.replace("%YAW_I%", String(yawPID.i));
  html.replace("%YAW_D%", String(yawPID.d));
  html.replace("%THR_VAL%", String(map(throttle, 1000, 2000, 0, 100)));
  return html;
}

// NRF
RF24 radio(CE, CSN);
const byte address[6] = "00001";
char receivedData[32] = {0};

// MPU
Adafruit_MPU6050 mpu;
float roll = 0;
float pitch = 0;
float yaw = 0;
float dt = 0;
unsigned long prev_time = 0;

// PID
double setpoint_roll = 0, input_roll, output_roll;
double setpoint_pitch = 0, input_pitch, output_pitch;
double setpoint_yaw = 0, input_yaw, output_yaw;
AutoPID pid_roll(&input_roll, &setpoint_roll, &output_roll, -150, 150,
                 rollPID.p, rollPID.i, rollPID.d);
AutoPID pid_pitch(&input_pitch, &setpoint_pitch, &output_pitch, -150, 150,
                  pitchPID.p, pitchPID.i, pitchPID.d);
AutoPID pid_yaw(&input_yaw, &setpoint_yaw, &output_yaw, -100, 100, yawPID.p,
                yawPID.i, yawPID.d);

// Motors
Servo FL, FR, BL, BR;
int servo_pins[4] = {1, 3, 0, 2};

void save_PID_config() {
  prefs.begin("PIDs", false);
  prefs.putBytes("rollPID", &rollPID, sizeof(rollPID));
  prefs.putBytes("pitchPID", &pitchPID, sizeof(pitchPID));
  prefs.putBytes("yawPID", &yawPID, sizeof(yawPID));
  prefs.end();
  Serial.println("PID prefs saved");
}

void save_Mpu_config() {
  prefs.begin("Mpu", false);
  prefs.putBytes("mpuData", &mpuData, sizeof(mpuData));
  prefs.end();
  Serial.println("Mpu prefs saved");
}

void load_PID_config() {
  prefs.begin("PIDs", true);
  if (prefs.isKey("rollPID") && prefs.isKey("pitchPID") &&
      prefs.isKey("yawPID")) {
    prefs.getBytes("rollPID", &rollPID, sizeof(rollPID));
    prefs.getBytes("pitchPID", &pitchPID, sizeof(pitchPID));
    prefs.getBytes("yawPID", &yawPID, sizeof(yawPID));
    Serial.println("Successfully");
  } else {
    Serial.println("faild");
  }
  prefs.end();
}

void load_Mpu_config() {
  prefs.begin("Mpu", true);
  if (prefs.isKey("mpuData")) {
    prefs.getBytes("mpuData", &mpuData, sizeof(mpuData));
    Serial.println("Data loaded");
  } else {
    Serial.println("No Mpu prefs found, using 0");
  }
  prefs.end();
}

void init_mpu() {
  isCalibrating = true;
  motorArmed = false;
  throttle = 1000;
  Serial.println("\n--- Initing ---");

  if (!mpu.begin())
    return;
  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_250_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

  float sum_roll = 0, sum_pitch = 0;
  float sum_gx = 0, sum_gy = 0, sum_gz = 0;

  for (int i = 0; i < 1500; i++) {
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);
    float cal_roll = atan2(a.acceleration.z, a.acceleration.x) * 57.296;
    float cal_pitch =
        atan2(-a.acceleration.y, sqrt(a.acceleration.x * a.acceleration.x +
                                      a.acceleration.z * a.acceleration.z)) *
        57.296;

    sum_roll += cal_roll;
    sum_pitch += cal_pitch;

    sum_gx += g.gyro.x;
    sum_gy += g.gyro.y;
    sum_gz += g.gyro.z;
    delay(1);
  }

  mpuData.roll_off =
      sum_roll / 1500; // 不在這裡減 90，由 input_roll = roll - 90 統一處理
  mpuData.pitch_off = (sum_pitch / 1500);

  mpuData.gyro_x_off = sum_gx / 1500;
  mpuData.gyro_y_off = sum_gy / 1500;
  mpuData.gyro_z_off = sum_gz / 1500;

  save_Mpu_config();
  Serial.println("Init Finished");
  isCalibrating = false;
}

void setup() {
  Serial.begin(115200);
  delay(3000);
  Serial.println("Hello World");

  // WiFi
  WiFi.persistent(false);
  WiFi.mode(WIFI_AP);
  if (WiFi.softAP(ssid, password)) {
    Serial.println("wifi setup successful");
  } else {
    Serial.println("wifi setup fail");
  }
  esp_wifi_set_max_tx_power(40);
  Serial.println("WiFi IP: " + WiFi.softAPIP().toString());

  // Server
  server.on("/", []() { server.send(200, "text/html", getHTML()); });
  server.on("/set_throttle", []() {
    if (server.hasArg("val")) {
      int percent = server.arg("val").toInt();
      throttle = map(percent, 0, 100, 1000, 2000);
      throttle = constrain(throttle, 1000, 2000);
    }
    server.send(200, "text/plain", "OK");
  });
  server.on("/kill", []() {
    motorArmed = false;
    throttle = 1000;
    server.send(200, "text/plain", "KILLED");
  });
  server.on("/arm", []() {
    motorArmed = true;
    server.send(200, "text/plain", "ARMED");
  });
  server.on("/mpu", []() {
    if (motorArmed) {
      server.send(200, "text/plain", "ERROR: Cannot calibrate while armed!");
      return;
    }
    init_mpu();
    server.send(200, "text/plain", "Calibration in progress...");
  });
  server.on("/clearMpu", []() {
    if (motorArmed) {
      server.send(200, "text/plain", "ERROR: Cannot calibrate while armed!");
      return;
    }
    mpuData = {0, 0, 0, 0, 0};
    save_Mpu_config();

    server.send(200, "text/plain", "MPU Reset");
  });
  server.on("/update", []() {
    String axis = server.arg("axis");
    String param = server.arg("param");
    double val = atof(server.arg("value").c_str());
    if (axis == "roll") {
      if (param == "p")
        rollPID.p = val;
      else if (param == "i")
        rollPID.i = val;
      else if (param == "d")
        rollPID.d = val;
      pid_roll.setGains(rollPID.p, rollPID.i, rollPID.d);
      save_PID_config();
    } else if (axis == "pitch") {
      if (param == "p")
        pitchPID.p = val;
      else if (param == "i")
        pitchPID.i = val;
      else if (param == "d")
        pitchPID.d = val;
      pid_pitch.setGains(pitchPID.p, pitchPID.i, pitchPID.d);
      save_PID_config();
    } else if (axis == "yaw") {
      if (param == "p")
        yawPID.p = val;
      else if (param == "i")
        yawPID.i = val;
      else if (param == "d")
        yawPID.d = val;
      pid_yaw.setGains(yawPID.p, yawPID.i, yawPID.d);
      save_PID_config();
    }
    server.sendHeader("Location", "/");
    server.send(303);
  });
  server.begin();

  // MPU Setup
  Wire.begin(8, 9);
  if (!mpu.begin()) {
    Serial.println("MPU Init Failed!");
    while (1)
      ;
  }
  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_250_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

  load_Mpu_config();

  SPI.begin(SCK, MISO, MOSI, CSN);
  radio.begin();

  FL.attach(servo_pins[0]);
  FR.attach(servo_pins[1]);
  BL.attach(servo_pins[2]);
  BR.attach(servo_pins[3]);

  Serial.print("Prefs load ");
  load_PID_config();

  pid_roll.setBangBang(0);
  pid_pitch.setBangBang(0);
  pid_yaw.setBangBang(0);
  pid_roll.setTimeStep(20);
  pid_pitch.setTimeStep(20);
  pid_yaw.setTimeStep(20);
  pid_roll.setGains(rollPID.p, rollPID.i, rollPID.d);
  pid_pitch.setGains(pitchPID.p, pitchPID.i, pitchPID.d);
  pid_yaw.setGains(yawPID.p, yawPID.i, yawPID.d);

  pid_roll.run();
  pid_pitch.run();
}

void loop() {
  server.handleClient();
  client_count = WiFi.softAPgetStationNum();
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  if (client_count == 0) {
    motorArmed = false; // 沒有 WiFi 連線時自動鎖定
  }

  unsigned long current_time = micros();
  if (prev_time == 0)
    prev_time = current_time;
  dt = (current_time - prev_time) / 1000000.0;
  prev_time = current_time;

  float raw_roll_angle = atan2(a.acceleration.z, a.acceleration.x) * 57.296;
  float raw_pitch_angle =
      atan2(-a.acceleration.y, sqrt(a.acceleration.x * a.acceleration.x +
                                    a.acceleration.z * a.acceleration.z)) *
      57.296; // 其實我也不知道這段是怎麼來的
  float final_acc_roll = raw_roll_angle - mpuData.roll_off;
  float final_acc_pitch = raw_pitch_angle - mpuData.pitch_off;
  float gyro_roll_rate = (g.gyro.y - mpuData.gyro_y_off) * 57.296;
  float gyro_pitch_rate = (g.gyro.x - mpuData.gyro_x_off) * 57.296;
  float gyro_yaw_rate = (g.gyro.z - mpuData.gyro_z_off) * 57.296;

  roll = (0.98 * (roll + gyro_roll_rate * dt) + 0.02 * final_acc_roll);
  pitch = 0.98 * (pitch + gyro_pitch_rate * dt) + 0.02 * final_acc_pitch;
  yaw += gyro_yaw_rate * dt;

  if (millis() - lastLoopTime >= 20) {
    lastLoopTime = millis();
    Serial.print("Roll:");
    Serial.print(roll - 90);
    Serial.print(" Pitch:");
    Serial.print(pitch);
    Serial.print(" Yaw: ");
    Serial.println(gyro_yaw_rate);

    if (throttle < 1050 || !motorArmed) {
      pid_roll.stop();
      pid_roll.reset();
      output_roll = 0;

      pid_pitch.stop();
      pid_pitch.reset();
      output_pitch = 0;

      pid_yaw.stop();
      pid_yaw.reset();
      output_yaw = 0;
    } else {
      input_roll = roll - 90;
      input_pitch = pitch;
      input_yaw = yaw;

      pid_roll.run();
      pid_pitch.run();
      pid_yaw.run();
    }

    int fl = constrain(throttle + output_roll - output_pitch, 1000, 1800);
    int fr = constrain(throttle - output_roll - output_pitch, 1000, 1800);
    int bl = constrain(throttle + output_roll + output_pitch, 1000, 1800);
    int br = constrain(throttle - output_roll + output_pitch, 1000, 1800);

    if (motorArmed) {
      FL.writeMicroseconds(fl);
      FR.writeMicroseconds(fr);
      BL.writeMicroseconds(bl);
      BR.writeMicroseconds(br);
    } else {
      FL.writeMicroseconds(1000);
      FR.writeMicroseconds(1000);
      BL.writeMicroseconds(1000);
      BR.writeMicroseconds(1000);
    }
  }
}