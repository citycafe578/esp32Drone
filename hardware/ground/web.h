#pragma once
#include <Arduino.h>

struct AxisPID { double p, i, d; };
extern AxisPID rate_rollPID, rate_pitchPID, rate_yawPID;
extern AxisPID rollPID, pitchPID, yawPID;
extern int throttle;

inline String getControlHTML() {
  return R"=====(
<!DOCTYPE html>
<html data-theme="dark">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <!-- PWA 標籤：支援加入主畫面變成無邊框 App -->
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <title>Drone RC | WS</title>
    <style>
        :root { color-scheme: dark; --bg: #111111; --text: #eeeeee; --muted: #999999; --line: #333333; --panel: #1a1a1a; --accent: #ffffff; --danger: #d93025; --success: #2ea44f; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
        
        /* 改用 flex 與 100dvh，動態扣除網址列高度 */
        body { text-align: center; background: var(--bg); color: var(--text); margin: 0; padding: 0; user-select: none; overflow: hidden; display: flex; flex-direction: column; height: 100dvh; }
        
        .header { padding: 15px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; }
        .btn-group { display: flex; gap: 8px; }
        button { background: var(--panel); color: var(--text); border: 1px solid var(--line); padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 15px; transition: all 0.2s; white-space: nowrap; }
        button:active { opacity: 0.7; }
        .btn-arm { color: var(--success); border-color: var(--success); }
        .btn-kill { color: var(--danger); border-color: var(--danger); }
        .btn-fs { background: #3498db; color: white; border-color: #3498db; }
        
        .status-bar { padding: 12px; background: var(--panel); border-bottom: 1px solid var(--line); font-size: 18px; font-weight: bold; letter-spacing: 1px; transition: color 0.3s; flex-shrink: 0; }
        .status-locked { color: var(--danger); }
        .status-armed { color: var(--success); }
        
        /* flex-grow: 1 自動填滿剩餘螢幕空間 */
        .rc-container { flex-grow: 1; display: flex; justify-content: space-around; align-items: center; padding: 10px; }
        
        .joystick-zone { width: 150px; height: 150px; background: var(--panel); border: 1px solid var(--line); border-radius: 50%; position: relative; touch-action: none; }
        .joystick-zone::before { content: ''; position: absolute; width: 100%; height: 1px; background: var(--line); top: 50%; left: 0; }
        .joystick-zone::after { content: ''; position: absolute; height: 100%; width: 1px; background: var(--line); left: 50%; top: 0; }
        .knob { width: 48px; height: 48px; background: var(--accent); border-radius: 50%; position: absolute; top: calc(50% - 24px); left: calc(50% - 24px); box-shadow: 0 4px 12px rgba(0,0,0,0.5); pointer-events: none; }
        .data-text { position: absolute; bottom: -30px; width: 100%; font-size: 13px; color: var(--muted); font-family: monospace; }
        
        /* 手機橫向超扁螢幕時的自動縮放 */
        @media (max-height: 380px) {
            .joystick-zone { width: 110px; height: 110px; }
            .knob { width: 36px; height: 36px; top: calc(50% - 18px); left: calc(50% - 18px); }
            .header { padding: 5px 10px; }
            button { padding: 6px 10px; font-size: 13px; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="btn-group">
            <button class="secondary" onclick="window.location.href='/tune'">Truning</button>
            <button class="btn-fs" onclick="toggleFullScreen()">⛶ FS</button>
        </div>
        <div class="btn-group">
            <button class="btn-arm" onclick="armDrone()">解鎖 ARM</button>
            <button class="btn-kill" onclick="killDrone()">鎖定 KILL</button>
        </div>
    </div>
    
    <div id="armStatus" class="status-bar status-locked">LOCKED</div>

    <div class="rc-container">
        <div id="zone-left" class="joystick-zone">
            <div id="knob-left" class="knob"></div>
            <div class="data-text" id="status-left">T:1000 | Y:1500</div>
        </div>
        <div id="zone-right" class="joystick-zone">
            <div id="knob-right" class="knob"></div>
            <div class="data-text" id="status-right">P:1500 | R:1500</div>
        </div>
    </div>

    <script>
        let throttle = 1000, yaw = 1500, pitch = 1500, roll = 1500;
        let ws;

        // 全螢幕功能
        function toggleFullScreen() {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => console.log(err));
            } else {
                if (document.exitFullscreen) document.exitFullscreen();
            }
        }

        function initWS() {
            ws = new WebSocket('ws://' + window.location.hostname + ':81/');
            ws.onclose = () => { setTimeout(initWS, 1000); };
        }
        initWS();

        setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                const packet = new ArrayBuffer(10);
                const view = new DataView(packet);
                view.setUint16(0, throttle, true);
                view.setInt16(2, roll, true);
                view.setInt16(4, pitch, true);
                view.setInt16(6, yaw, true);
                view.setInt16(8, 0, true);
                ws.send(packet);
            }
        }, 20);
        
        function updateStatus(isArmed) {
            const statusEl = document.getElementById('armStatus');
            if(isArmed) {
                statusEl.className = 'status-bar status-armed'; statusEl.innerText = 'ARMED';
            } else {
                statusEl.className = 'status-bar status-locked'; statusEl.innerText = 'LOCKED';
                resetJoystick(true); resetJoystick(false);
            }
        }

        function armDrone() { fetch('/arm').then(()=>updateStatus(true)); }
        function killDrone() { fetch('/kill').then(()=>updateStatus(false)); }

        // 改為動態計算半徑，適應 RWD 縮放
        function resetJoystick(isLeft) {
            const zone = document.getElementById(isLeft ? 'zone-left' : 'zone-right');
            const knob = document.getElementById(isLeft ? 'knob-left' : 'knob-right');
            const status = document.getElementById(isLeft ? 'status-left' : 'status-right');
            let maxRadius = zone.clientWidth / 2;

            if (isLeft) {
                knob.style.transform = `translate(0px, ${maxRadius}px)`;
                yaw = 1500; throttle = 1000; status.innerText = `T:1000 | Y:1500`;
            } else {
                knob.style.transform = `translate(0px, 0px)`;
                roll = 1500; pitch = 1500; status.innerText = `P:1500 | R:1500`;
            }
        }

        function createJoystick(zoneId, knobId, isLeft) {
            const zone = document.getElementById(zoneId), knob = document.getElementById(knobId);
            const status = document.getElementById(isLeft ? 'status-left' : 'status-right');
            let activeTouchId = null;
            
            function updateParams(clientX, clientY) {
                let rect = zone.getBoundingClientRect();
                let maxRadius = rect.width / 2;
                let dx = clientX - (rect.left + maxRadius), dy = clientY - (rect.top + maxRadius);
                let distance = Math.sqrt(dx*dx + dy*dy);
                
                if (distance > maxRadius) { dx = (dx/distance)*maxRadius; dy = (dy/distance)*maxRadius; }
                knob.style.transform = `translate(${dx}px, ${dy}px)`;
                
                if (isLeft) {
                    throttle = Math.round(1200 - (dy / maxRadius) * 200); 
                    yaw = Math.round(1500 + (dx / maxRadius) * 500);
                    status.innerText = `T:${throttle} | Y:${yaw}`;
                } else {
                    roll = Math.round(1500 + (dx / maxRadius) * 500); 
                    pitch = Math.round(1500 - (dy / maxRadius) * 500); 
                    status.innerText = `P:${pitch} | R:${roll}`;
                }
            }

            resetJoystick(isLeft);
            window.addEventListener('resize', () => resetJoystick(isLeft));
            
            zone.addEventListener('touchstart', (e) => {
                e.preventDefault();
                for(let i=0; i<e.changedTouches.length; i++) {
                    if (activeTouchId === null) {
                        activeTouchId = e.changedTouches[i].identifier;
                        updateParams(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
                        break;
                    }
                }
            }, {passive: false});
            
            zone.addEventListener('touchmove', (e) => {
                e.preventDefault();
                for(let i=0; i<e.changedTouches.length; i++) {
                    if (e.changedTouches[i].identifier === activeTouchId) updateParams(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
                }
            }, {passive: false});
            
            const endDrag = (e) => {
                e.preventDefault();
                for(let i=0; i<e.changedTouches.length; i++) {
                    if (e.changedTouches[i].identifier === activeTouchId) { activeTouchId = null; resetJoystick(isLeft); }
                }
            };
            
            zone.addEventListener('touchend', endDrag);
            zone.addEventListener('touchcancel', endDrag);
        }

        // 確保 CSS 渲染完成後才抓取半徑
        setTimeout(() => {
            createJoystick('zone-left', 'knob-left', true);
            createJoystick('zone-right', 'knob-right', false);
        }, 100);
    </script>
</body>
</html>)=====";
}

inline String getTuneHTML() {
  String html = R"=====(
<!DOCTYPE html>
<html data-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="mobile-web-app-capable" content="yes">
    <title>Drone Tune | WS</title>
    <style>
        :root { color-scheme: dark; --bg: #111111; --text: #eeeeee; --muted: #999999; --line: #333333; --panel: #1a1a1a; --accent: #ffffff; --accent-contrast: #000000; --danger: #d93025; --success: #2ea44f; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
        body { background: var(--bg); color: var(--text); margin: 0; padding: 0 0 40px 0; user-select: none; }
        .header { padding: 15px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; background: var(--bg); z-index: 100; }
        .btn-group { display: flex; gap: 8px; }
        button { background: var(--panel); color: var(--text); border: 1px solid var(--line); padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 15px; }
        button.primary { background: var(--accent); color: var(--accent-contrast); }
        .btn-arm { color: var(--success); border-color: var(--success); }
        .btn-kill { color: var(--danger); border-color: var(--danger); }
        .status-bar { padding: 12px; text-align: center; background: var(--panel); border-bottom: 1px solid var(--line); font-size: 18px; font-weight: bold; transition: color 0.3s; }
        .status-locked { color: var(--danger); }
        .status-armed { color: var(--success); }
        .container { max-width: 500px; margin: 20px auto; padding: 0 15px; }
        .card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 20px; margin-bottom: 20px; }
        .card h3 { margin: 0 0 15px 0; font-size: 18px; border-bottom: 1px solid var(--line); padding-bottom: 10px; }
        label { display: block; margin-bottom: 8px; font-size: 14px; color: var(--muted); }
        select, input[type=number] { width: 100%; padding: 12px; margin-bottom: 15px; border-radius: 6px; border: 1px solid var(--line); background: var(--bg); color: var(--text); font-size: 16px; box-sizing: border-box; }
        input:focus, select:focus { outline: none; border-color: var(--muted); }
        input[type=range] { -webkit-appearance: none; width: 100%; height: 6px; background: var(--line); border-radius: 3px; outline: none; margin: 15px 0 25px 0; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 24px; height: 24px; background: var(--accent); border-radius: 50%; cursor: pointer; }
        table { width: 100%; border-collapse: collapse; font-size: 14px; }
        th, td { padding: 12px 8px; border-bottom: 1px solid var(--line); text-align: center; }
        th { color: var(--muted); font-weight: normal; }
    </style>
    <script>
        let currentThrottlePWM = 1000;
        let ws;

        function initWS() {
            ws = new WebSocket('ws://' + window.location.hostname + ':81/');
            ws.onclose = () => { setTimeout(initWS, 1000); };
        }
        initWS();

        setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                const packet = new ArrayBuffer(10);
                const view = new DataView(packet);
                view.setUint16(0, currentThrottlePWM, true);
                view.setInt16(2, 1500, true);
                view.setInt16(4, 1500, true);
                view.setInt16(6, 1500, true);
                view.setInt16(8, 0, true);
                ws.send(packet);
            }
        }, 50);

        function updateStatus(isArmed) {
            const statusEl = document.getElementById('armStatus');
            if(isArmed) {
                statusEl.className = 'status-bar status-armed'; statusEl.innerText = 'ARMED';
            } else {
                statusEl.className = 'status-bar status-locked'; statusEl.innerText = 'LOCKED';
                resetThrottle();
            }
        }

        // percent: 0~100 -> PWM: 1000~1400
        function setThrottle(percent) { 
            document.getElementById('thrDisp').innerText = percent + '%'; 
            currentThrottlePWM = 1000 + Math.round((parseInt(percent) / 100) * 400);
        }
        
        function resetThrottle() { document.getElementById('thrSlider').value = 0; setThrottle(0); }
        document.addEventListener('DOMContentLoaded', () => {
            const slider = document.getElementById('thrSlider');
            if (slider) { slider.addEventListener('touchend', resetThrottle); slider.addEventListener('mouseup', resetThrottle); }
        });

        function armDrone() {
            if (document.getElementById('thrSlider').value > 5) alert("請先將油門拉到 0% 再解鎖");
            else fetch('/arm').then(()=>updateStatus(true));
        }
        function killDrone() { fetch('/kill').then(()=>updateStatus(false)); }
        
        function sendPIDUpdate() {
            const axis = document.getElementById('axis').value, param = document.getElementById('param').value, value = document.getElementById('pidValue').value;
            if (axis === "null" || param === "null" || value === "") return alert("請完整填寫參數");
            fetch(`/update?axis=${axis}&param=${param}&value=${value}`)
            .then(() => window.location.reload())
            .catch(() => alert("連線失敗！"));
        }
    </script>
</head>
<body>
    <div class="header">
        <button onclick="window.location.href='/'">Controler</button>
        <div class="btn-group">
            <button class="btn-arm" onclick="armDrone()">解鎖 ARM</button>
            <button class="btn-kill" onclick="killDrone()">鎖定 KILL</button>
        </div>
    </div>
    
    <div id="armStatus" class="status-bar status-locked">LOCKED</div>

    <div class="container">
        <div class="card">
            <h3>動力測試 (Throttle)</h3>
            <label style="display:flex; justify-content:space-between;">
                <span>油門輸出</span> <span id="thrDisp" style="color:var(--accent); font-family:monospace;">%THR_VAL%%</span>
            </label>
            <input type="range" id="thrSlider" min="0" max="100" value="%THR_VAL%" oninput="setThrottle(this.value)">
            <div style="display:flex; gap:10px;">
                <button style="flex:1;" onclick="if(document.getElementById('thrSlider').value>5) return alert('油門需歸零'); fetch('/mpu');">陀螺儀校正</button>
                <button style="flex:1;" onclick="if(document.getElementById('thrSlider').value>5) return alert('油門需歸零'); fetch('/clearMpu');">清除校正</button>
            </div>
        </div>

        <div class="card">
            <h3>PID 參數設定 (HTTP)</h3>
            <select id="axis">
                <option value="null">選擇軸向</option>
                <option value="roll">Roll</option><option value="pitch">Pitch</option><option value="yaw">Yaw</option>
                <option value="rate_roll">Rate Roll</option><option value="rate_pitch">Rate Pitch</option>
            </select>
            <select id="param">
                <option value="null">選擇參數 (P, I, D)</option><option value="p">Proportional (P)</option><option value="i">Integral (I)</option><option value="d">Derivative (D)</option>
            </select>
            <input type="number" id="pidValue" step="0.00001" inputmode="decimal" placeholder="輸入數值" required>
            <button class="primary" style="width: 100%;" onclick="sendPIDUpdate()">儲存參數</button>
        </div>

        <div class="card">
            <h3>目前 PID 數值</h3>
            <table>
                <thead><tr><th>軸向</th><th>P</th><th>I</th><th>D</th></tr></thead>
                <tbody>
                    <tr><td>Roll</td><td>%ROLL_P%</td><td>%ROLL_I%</td><td>%ROLL_D%</td></tr>
                    <tr><td>Pitch</td><td>%PITCH_P%</td><td>%PITCH_I%</td><td>%PITCH_D%</td></tr>
                    <tr><td>Yaw</td><td>%YAW_P%</td><td>%YAW_I%</td><td>%YAW_D%</td></tr>
                    <tr><td>Rate Roll</td><td>%RATE_ROLL_P%</td><td>%RATE_ROLL_I%</td><td>%RATE_ROLL_D%</td></tr>
                    <tr><td>Rate Pitch</td><td>%RATE_PITCH_P%</td><td>%RATE_PITCH_I%</td><td>%RATE_PITCH_D%</td></tr>
                </tbody>
            </table>
        </div>
    </div>
</body>
</html>
  )=====";

  html.replace("%ROLL_P%", String(rollPID.p)); html.replace("%ROLL_I%", String(rollPID.i)); html.replace("%ROLL_D%", String(rollPID.d));
  html.replace("%PITCH_P%", String(pitchPID.p)); html.replace("%PITCH_I%", String(pitchPID.i)); html.replace("%PITCH_D%", String(pitchPID.d));
  html.replace("%YAW_P%", String(yawPID.p)); html.replace("%YAW_I%", String(yawPID.i)); html.replace("%YAW_D%", String(yawPID.d));
  html.replace("%THR_VAL%", String(map(throttle, 1000, 1400, 0, 100)));
  html.replace("%RATE_ROLL_P%", String(rate_rollPID.p)); html.replace("%RATE_ROLL_I%", String(rate_rollPID.i)); html.replace("%RATE_ROLL_D%", String(rate_rollPID.d));
  html.replace("%RATE_PITCH_P%", String(rate_pitchPID.p)); html.replace("%RATE_PITCH_I%", String(rate_pitchPID.i)); html.replace("%RATE_PITCH_D%", String(rate_pitchPID.d));
  return html;
}