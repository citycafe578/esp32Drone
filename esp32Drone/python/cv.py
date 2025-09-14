from flask import Flask, Response, request, jsonify
from flask_cors import CORS
import cv2
import json
import time
import os
import numpy as np
import serial.tools.list_ports

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

camera = None
paused = False
json_file = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'settings.json'))


def get_camera_index():
    try:
        with open(json_file, "r", encoding="utf-8") as f:
            j = json.load(f)
        idx = int(j["otherSettings"]["imageTransmission"])
    except Exception:
        idx = 0
    return idx


def set_camera(idx):
    global camera
    if camera is not None and camera.isOpened():
        camera.release()
    camera = cv2.VideoCapture(idx)
    if not camera.isOpened():
        print(f"[ERROR] Camera index {idx} open failed! 請確認該 index 是否有攝影機")
    else:
        print("Camera set to index:", idx)


@app.route('/set_camera', methods=['POST'])
def set_camera_route():
    data = request.get_json()
    print(data)
    idx = int(data.get('imageTransmission', 0))
    with open(json_file, "r+", encoding="utf-8") as f:
        j = json.load(f)
        j["otherSettings"]["imageTransmission"] = str(int(data.get('imageTransmission', 0)))
        f.seek(0)
        json.dump(j, f, indent=2)
        f.truncate()
    set_camera(idx)
    return jsonify({'status': 'ok', 'camera_index': idx})


@app.route('/pause_camera', methods=['POST'])
def pause_camera():
    global paused, camera
    paused = True
    if camera is not None and camera.isOpened():
        camera.release()
    return jsonify({'status': 'paused'})


@app.route('/resume_camera', methods=['POST'])
def resume_camera():
    global paused, camera
    paused = False
    idx = get_camera_index()
    set_camera(idx)
    return jsonify({'status': 'resumed'})


def generate_frames():
    global camera, paused
    last_idx = None

    while True:
        idx = get_camera_index()
        if last_idx != idx:
            set_camera(idx)
            last_idx = idx

        if paused:
            if camera is not None and camera.isOpened():
                camera.release()
                camera = None
            time.sleep(0.1)
            continue

        if camera is None or not camera.isOpened():
            time.sleep(0.5)
            continue

        success, frame = camera.read()
        if not success:
            print(f"[WARN] Can't grab frame from camera index {last_idx}")
            time.sleep(0.1)
            continue
        
        # 沒修好，之後再修
        with open(json_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        if data["droneSettings"]["imageHorizontalFlip"]:
            frame = cv2.flip(frame, 1)
        if data["droneSettings"]["imageVerticalFlip"]:
            frame = cv2.flip(frame, 0)
        sharpen = int(data["otherSettings"].get("sharpen", "0"))
        grayscale = int(data["otherSettings"].get("grayscale", "1"))
        if sharpen > 0:
            k = 10 + (sharpen / 10.0)
            kernel = np.array([
                [0, -1, 0],
                [-1, k, -1],
                [0, -1, 0]
            ], dtype=np.float32)
            frame = cv2.filter2D(frame, -1, kernel)

        if grayscale > 0:
            print("grayscale changed")
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            gray_bgr = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
            alpha = grayscale / 100.0
            frame = cv2.addWeighted(frame, 1 - alpha, gray_bgr, alpha, 0)
        


        ret, buffer = cv2.imencode('.jpg', frame)
        frame = buffer.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/list_cameras')
def list_cameras():
    available = []
    for idx in range(5):
        cap = cv2.VideoCapture(idx)
        if cap.isOpened():
            available.append(idx)
            cap.release()
    return jsonify({'cameras': available})


@app.route('/set_drone_settings', methods=['POST'])
def set_drone_settings():
    data = request.get_json()
    with open(json_file, "r+", encoding="utf-8") as f:
        j = json.load(f)
        j["droneSettings"]["minimumCruisingAltitude"] = data.get("minimumCruisingAltitude", "OFF")
        j["droneSettings"]["lowAltitudeWarning"] = data.get("lowAltitudeWarning", "OFF")
        j["droneSettings"]["imageHorizontalFlip"] = bool(data.get("imageHorizontalFlip", False))
        j["droneSettings"]["imageVerticalFlip"] = bool(data.get("imageVerticalFlip", False))
        f.seek(0)
        json.dump(j, f, indent=2)
        f.truncate()
    return jsonify({'status': 'ok'})

@app.route('/get_ports', methods=['GET'])
def get_ports():
    devices = []
    ports = serial.tools.list_ports.comports()
    for port in ports:
        devices.append({
            "device": port.device,
            "name": port.description
        })
    return jsonify({"ports": devices})
    


if __name__ == "__main__":
    set_camera(get_camera_index())
    app.run(host="0.0.0.0", port=5000, debug=True)



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
