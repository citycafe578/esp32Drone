#include <Wire.h>
#include <MPU6050.h>
#include <SPI.h>
#include <RF24.h>
#include <ESP32Servo.h>
#include <AutoPID.h>
#include <EasyButton.h>
#include <WiFi.h>
#include <WebServer.h>

#define SCK 4
#define MISO 5
#define MOSI 6
#define CSN 7
#define CE 10

//WiFi
const char *ssid = "Drone_PID_Config";
const char *password = "abalaba123";

WebServer server(80);

//PID 數據結構
struct AxisPID {
  double p, i, d;
};

AxisPID rollPID  = {0.0, 0.0, 0.0};
AxisPID pitchPID = {0.0, 0.0, 0.0};
AxisPID yawPID   = {0.0, 0.0, 0.0};

//HTML
String getHTML() {
  String html = R"=====(
    <!DOCTYPE html>
    <html lang="zh-TW">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>無人機 PID 調參面板</title>
        <style>
            :root {
                --bg-color: #1a1a1a;
                --card-bg: #2d2d2d;
                --text-color: #eee;
                --accent-color: #3498db;
                --accent-hover: #2980b9;
            }
            body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                background-color: var(--bg-color);
                color: var(--text-color);
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: 20px;
                margin: 0;
            }
            h2 { margin-bottom: 20px; color: var(--accent-color); }
            .card {
                background-color: var(--card-bg);
                padding: 25px;
                border-radius: 15px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                width: 100%;
                max-width: 400px;
                margin-bottom: 20px;
            }
            .form-group {
                margin-bottom: 15px;
                text-align: left;
            }
            label {
                display: block;
                margin-bottom: 5px;
                font-size: 14px;
                color: #bbb;
            }
            select, input[type="number"] {
                width: 100%;
                padding: 12px;
                border-radius: 8px;
                border: 1px solid #444;
                background-color: #1e1e1e;
                color: white;
                font-size: 16px;
                box-sizing: border-box;
            }
            button {
                width: 100%;
                padding: 15px;
                background-color: var(--accent-color);
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 18px;
                font-weight: bold;
                cursor: pointer;
                transition: background 0.2s;
                margin-top: 10px;
            }
            button:active { background-color: var(--accent-hover); }
            
            table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 10px;
                background-color: #222;
                border-radius: 8px;
                overflow: hidden;
            }
            th, td {
                padding: 12px;
                border: 1px solid #444;
                text-align: center;
            }
            th { background-color: #333; color: var(--accent-color); }
            .status-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
        </style>
    </head>
    <body>

        <h2>Drone PID Tuner</h2>

        <div class="card">
            <form action="/update" method="GET">
                <div class="form-group">
                    <label>選擇調整軸向</label>
                    <select name="axis">
                        <option value="roll">Roll (橫滾)</option>
                        <option value="pitch">Pitch (俯仰)</option>
                        <option value="yaw">Yaw (偏航)</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>選擇 PID 參數</label>
                    <select name="param">
                        <option value="p">P (比例)</option>
                        <option value="i">I (積分)</option>
                        <option value="d">D (微分)</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>輸入數值 (例如: 1.50)</label>
                    <input type="number" name="value" step="0.00000001" min="0" max="100" placeholder="0.00" required>
                </div>

                <button type="submit">立即更新參數</button>
            </form>
        </div>

        <div class="card">
            <div class="status-header">
                <h3>目前參數列表</h3>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>軸向</th>
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

    </body>
    </html>
    )=====";
  html.replace("%ROLL_P%",  String(rollPID.p));
  html.replace("%ROLL_I%",  String(rollPID.i));
  html.replace("%ROLL_D%",  String(rollPID.d));
  
  html.replace("%PITCH_P%", String(pitchPID.p));
  html.replace("%PITCH_I%", String(pitchPID.i));
  html.replace("%PITCH_D%", String(pitchPID.d));
  
  html.replace("%YAW_P%",   String(yawPID.p));
  html.replace("%YAW_I%",   String(yawPID.i));
  html.replace("%YAW_D%",   String(yawPID.d));
  return html;
}

//nrf
RF24 radio(CE, CSN);
const byte address[6] = "00001";
char receivedData[32] = {0};

// MPU6050
MPU6050 mpu;
float roll = 0;
unsigned long lastTime = 0;

//pid
//pid_roll
double setpoint_roll = 0; //之後拉到loop裡面
double input_roll, output_roll;
AutoPID pid_roll(&input_roll, &setpoint_roll, &output_roll, -400, 400, rollPID.p/20, rollPID.i, rollPID.d);
//pid_pitch
double setpoint_pitch = 0; //之後拉到loop裡面
double input_pitch, output_pitch;
AutoPID pid_pitch(&input_pitch, &setpoint_pitch, &output_pitch, -400, 400, pitchPID.p/20, pitchPID.i, pitchPID.d);
//pit_yaw
double setpoint_yaw = 0; //之後拉到loop裡面
double input_yaw, output_yaw;
AutoPID pid_yaw(&input_yaw, &setpoint_yaw, &output_yaw, -400, 400, yawPID.p/20, yawPID.i, yawPID.d);

//motors
Servo FL, FR, BL, BR;
int servo_pins[4] = { 1, 3, 0, 2 };
int throttle;

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

  WiFi.softAP(ssid, password);
  Serial.println("WiFi started: " + String(ssid));
  Serial.print("IP address: "); Serial.println(WiFi.softAPIP());

  server.on("/", []() {
    server.send(200, "text/html", getHTML());
  });

  server.on("/update", []() {
    String axis = server.arg("axis");
    String param = server.arg("param");
    float val = server.arg("value").toFloat();

    if (axis == "roll") {
      if (param == "p") rollPID.p = val;
      else if (param == "i") rollPID.i = val;
      else if (param == "d") rollPID.d = val;
      pid_roll.setGains(rollPID.p, rollPID.i, rollPID.d);
    } else if (axis == "pitch") {
      if (param == "p") pitchPID.p = val;
      else if (param == "i") pitchPID.i = val;
      else if (param == "d") pitchPID.d = val;
      pid_pitch.setGains(pitchPID.p, pitchPID.i, pitchPID.d);
    } else if (axis == "yaw") {
      if (param == "p") yawPID.p = val;
      else if (param == "i") yawPID.i = val;
      else if (param == "d") yawPID.d = val;
      pid_yaw.setGains(yawPID.p, yawPID.i, yawPID.d);
    }

    Serial.printf("更新成功: %s %s --> %.8f\n", axis.c_str(), param.c_str(), val);
    server.sendHeader("Location", "/");
    server.send(303);
  });

  server.begin();
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

  SPI.begin(SCK, MISO, MOSI, CSN);
  if (!radio.begin()) {
    Serial.println("Radio hardware is not responding!");
    while (1);
  }

  //無線電
  radio.setPALevel(RF24_PA_HIGH);
  radio.setDataRate(RF24_2MBPS);
  radio.setChannel(100);
  radio.openReadingPipe(1, address);
  radio.setAutoAck(false);
  radio.startListening();

  //馬達
  FL.attach(servo_pins[0]);
  FR.attach(servo_pins[1]);
  BL.attach(servo_pins[2]);
  BR.attach(servo_pins[3]);
  lastTime = millis();

  //PID
  pid_roll.setBangBang(0);
  pid_roll.setTimeStep(20);
  pid_roll.setGains(rollPID.p, rollPID.i, rollPID.d);
  pid_roll.run();

  button.onPressedFor(3000, init_mpu);
}

void loop() {
  server.handleClient();
  if (radio.available()) {
    radio.read(&receivedData, sizeof(receivedData));
    int throttleRaw = 0;

    sscanf(receivedData, "%d", &throttleRaw);
    throttle = constrain(map(throttleRaw, 0, 1023, 1000, 2000), 1000, 2000);
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
  if(throttle < 1100){
    pid_roll.stop();
    pid_roll.reset();
    output_roll = 0;
  }else{
    input_roll = roll;
    pid_roll.run();
  }


  int fl = constrain(throttle + output_roll, 1000, 2000);
  int fr = constrain(throttle - output_roll, 1000, 2000);
  int bl = constrain(throttle + output_roll, 1000, 2000);
  int br = constrain(throttle - output_roll, 1000, 2000);

  //正式版需刪除
  if(fl > 1800){
    fl = 0;
  }
  if(fr > 1800){
    fr = 0;
  }
  if(bl > 1800){
    bl = 0;
  }
  if(br > 1800){
    br = 0;
  }

  FL.writeMicroseconds(fl);
  FR.writeMicroseconds(fr);
  BL.writeMicroseconds(bl);
  BR.writeMicroseconds(br);

  // Serial.print("Roll: "); Serial.print(roll);
  // Serial.print(" | PID_R: "); Serial.print(output_roll);
  // Serial.print(" | FL: "); Serial.print(fl);
  // Serial.print(" | FR: "); Serial.print(fr);
  // Serial.print(" | BL: "); Serial.print(bl);
  // Serial.print(" | BR: "); Serial.println(br);

  button.update();

  //delay(20);
}