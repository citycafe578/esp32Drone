from flask import Flask, Response, request, jsonify
from flask_cors import CORS
import cv2
import json
import time
import os
import numpy as np
import serial
import serial.tools.list_ports
from flask_socketio import SocketIO, emit
import threading
import struct
import sys

# 確保輸出即時顯示
sys.stdout.reconfigure(line_buffering=True)

app = Flask(__name__)
CORS(app)
# 設定 async_mode 確保 SocketIO 效能
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

camera = None
paused = False
json_file = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'settings.json'))
control_data = {}
ser = None
serial_lock = threading.Lock()  # 關鍵：防止多執行緒同時讀寫 Serial

# --- Serial 讀取執行緒 ---
def read_serial():
    global ser
    while True:
        with serial_lock:
            if ser is not None and ser.is_open:
                try:
                    if ser.in_waiting > 0:
                        # 讀取一整行來自 ESP32 的訊息
                        line = ser.readline().decode('utf-8', errors='ignore').strip()
                        if line:
                            print(f"[ESP32] {line}")
                except Exception as e:
                    print(f"[Serial Read Error] {e}")
                    # 如果遇到嚴重錯誤（如拔掉線），關閉 port
                    try:
                        ser.close()
                    except:
                        pass
                    ser = None
        time.sleep(0.01) # 稍微休息，避免佔用過多 CPU

threading.Thread(target=read_serial, daemon=True).start()

# --- Serial 控制邏輯 ---
def try_open_serial(port: str):
    global ser
    with serial_lock:
        if ser is not None:
            try:
                ser.close()
            except:
                pass
            ser = None
        try:
            # 開啟時設定 DTR=False 某些機板可以防止反覆重置，但通常 ESP32 會重置一次
            ser = serial.Serial(port, 115200, timeout=0.05)
            time.sleep(1.5) # 重要：等待 ESP32 Bootloader 跑完進入 loop()
            ser.reset_input_buffer()
            ser.reset_output_buffer()
            print(f"Serial opened and ready: {port}")
        except Exception as e:
            ser = None
            print(f"[WARN] Serial open failed ({port}): {e}")

# --- 相機邏輯 ---
def get_camera_index():
    try:
        with open(json_file, "r", encoding="utf-8") as f:
            j = json.load(f)
        return int(j["otherSettings"]["imageTransmission"])
    except:
        return 0

def set_camera(idx):
    global camera
    if camera is not None and camera.isOpened():
        camera.release()
    camera = cv2.VideoCapture(idx)
    if not camera.isOpened():
        print(f"[ERROR] Camera index {idx} open failed!")
    else:
        print(f"Camera set to index: {idx}")

# --- API Routes ---
@app.route('/set_camera', methods=['POST'])
def set_camera_route():
    data = request.get_json()
    idx = int(data.get('imageTransmission', 0))
    # 更新 JSON
    try:
        with open(json_file, "r+", encoding="utf-8") as f:
            j = json.load(f)
            j["otherSettings"]["imageTransmission"] = str(idx)
            f.seek(0)
            json.dump(j, f, indent=2)
            f.truncate()
    except: pass
    set_camera(idx)
    return jsonify({'status': 'ok', 'camera_index': idx})

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

def generate_frames():
    global camera, paused
    last_idx = None
    while True:
        idx = get_camera_index()
        if last_idx != idx:
            set_camera(idx)
            last_idx = idx
        
        if paused or camera is None or not camera.isOpened():
            time.sleep(0.2)
            continue

        success, frame = camera.read()
        if not success:
            time.sleep(0.1)
            continue

        # 這裡可以加入影像處理邏輯 (Flip/Sharpen/Grayscale)
        ret, buffer = cv2.imencode('.jpg', frame)
        yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')

@app.route('/get_ports', methods=['GET'])
def get_ports():
    ports = [{"device": p.device, "name": p.description} for p in serial.tools.list_ports.comports()]
    return jsonify({"ports": ports})

@app.route('/set_port', methods=['POST'])
def set_port():
    port = request.get_json().get('port', '')
    if not port: return jsonify({'status': 'error'}), 400
    try_open_serial(port)
    # 儲存到設定檔
    try:
        with open(json_file, "r+", encoding="utf-8") as f:
            j = json.load(f)
            j["otherSettings"]["reciver"] = port
            f.seek(0); json.dump(j, f, indent=2); f.truncate()
    except: pass
    return jsonify({'status': 'ok' if ser else 'failed', 'port': port})

# --- SocketIO 控制訊號 (最重要的部分) ---
@socketio.on('control_signal')
def handle_signal(signal_data):
    global ser
    # 打包成跟 ESP32 ComData 結構體一致的格式：
    # < (Little Endian), B (Header), B (Cmd), h... (9 個 int16_t)
    try:
        data = struct.pack('<BBhhhhhhhhh',
            0xAA, 
            0x01, 
            int(signal_data.get('throttle', 0)),
            int(signal_data.get('pitch', 0)),
            int(signal_data.get('yaw', 0)),
            int(signal_data.get('roll', 0)),
            int(signal_data.get('emergency_stop', 0)),
            int(signal_data.get('start_up', 0)),
            int(signal_data.get('speed_mode', 0)),
            int(signal_data.get('obstacle_avoidance', 0)),
            int(signal_data.get('still_dont_know', 0))
        )
        
        with serial_lock:
            if ser is not None and ser.is_open:
                ser.write(data)
                ser.flush() # 確保資料送出
                print(f"[TX {len(data)} bytes] {signal_data}")
            else:
                print(f"[TX skipped: serial not open] {signal_data}")
    except Exception as e:
        print(f"[Joystick Error] {e}")

    emit('status_update', signal_data, broadcast=True)

def get_saved_port():
    try:
        with open(json_file, "r", encoding="utf-8") as f:
            j = json.load(f)
        p = j.get("otherSettings", {}).get("reciver", "")
        return p if p and p != "null" else None
    except: return None

if __name__ == "__main__":
    set_camera(get_camera_index())
    saved_port = get_saved_port()
    if saved_port:
        try_open_serial(saved_port)
    
    # allow_unsafe_werkzeug 是為了在開發環境繞過一些警告
    socketio.run(app, host="0.0.0.0", port=5000, debug=False, use_reloader=False, allow_unsafe_werkzeug=True)


# Art by Blazej Kozlowski
#        _                        
#        \`*-.                    
#         )  _`-.                 
#        .  : `. .                
#        : _   '  \               
#        ; *` _.   `*-._          
#        `-.-'          `-.       
#          ;       `       `.     
#          :.       .        \    
#          . \  .   :   .-'   .   
#          '  `+.;  ;  '      :   
#          :  '  |    ;       ;-. 
#          ; '   : :`-:     _.`* ;
# [bug] .*' /  .*' ; .*`- +'  `*' 
#       `*-*   `*-*  `*-*'
