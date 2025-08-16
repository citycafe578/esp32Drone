import { useEffect, useState } from 'react';
import './JoystickSetting.css';

const JoystickSetting = () => {
  const [gamepads, setGamepads] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [maxAxis, setMaxAxis] = useState(null);
  const [maxDelta, setMaxDelta] = useState(null);

  const controlAxes = [
    { key: 'altitude', label: 'Altitude' },
    { key: 'pitch', label: 'Pitch' },
    { key: 'yaw', label: 'Yaw' },
    { key: 'roll', label: 'Roll' },
  ];

  const controlBtns = [
    { key: 'start up', label: 'Start Up' },
    { key: 'speed mode', label: 'Speed Mode' },
    { key: 'obstacle avoidance', label: 'Obstacle Avoidance' },
    { key: 'still dont know', label: 'Still Dont Know' },
    { key: 'emergency stop', label: 'Emergency Stop' }
  ];

  // const getInitJoystickIndex = () => {
  //   const local = localStorage.getItem('joystickIndex');
  //   if (local) return JSON.parse(local);
  //   return 0;
  // }

  const getInitAxisMapping = () => {
    const local = localStorage.getItem('axisMapping');
    if (local) return JSON.parse(local);
    return {
      altitude: null,
      pitch: null,
      yaw: null,
      roll: null,
    };
  };
  const getInitBtnMapping = () => {
    const local = localStorage.getItem('btnMapping');
    if (local) return JSON.parse(local);
    return {
      'start up': null,
      'speed mode': null,
      'downward obstacle avoidance': null,
      'still dont know': null,
      'emergency stop': null
    };
  };

  const [axisMapping, setAxisMapping] = useState(getInitAxisMapping);
  const [btnMapping, setBtnMapping] = useState(getInitBtnMapping);
  const [detectingKey, setDetectingKey] = useState(null);

  const updateGamepads = () => {
    const pads = navigator.getGamepads
      ? Array.from(navigator.getGamepads()).filter(Boolean)
      : [];
    setGamepads(pads);
  };

  useEffect(() => {
    window.addEventListener('gamepadconnected', updateGamepads);
    window.addEventListener('gamepaddisconnected', updateGamepads);
    updateGamepads();
    return () => {
      window.removeEventListener('gamepadconnected', updateGamepads);
      window.removeEventListener('gamepaddisconnected', updateGamepads);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('joystickIndex', JSON.stringify(selectedIndex));
  }, [selectedIndex]);

  // 舊版偵測搖桿訊號(三秒內尋找變化最大的軸)
  // const handleDetectAxes = () => {
  //   if (!gamepads[selectedIndex]) return;
  //   setDetecting(true);
  //   setMaxAxis(null);
  //   setMaxDelta(null);
  //   const gamepad = gamepads[selectedIndex];
  //   const axesCount = gamepad.axes.length;
  //   const startValues = [...gamepad.axes];
  //   const maxDiffs = Array(axesCount).fill(0);
  //   let startTime = null;

  //   function detectLoop(ts) {
  //     if (!startTime) startTime = ts;
  //     const nowPad = navigator.getGamepads()[gamepad.index];
  //     if (nowPad) {
  //       for (let i = 0; i < axesCount; i++) {
  //         const diff = Math.abs(nowPad.axes[i] - startValues[i]);
  //         if (diff > maxDiffs[i]) maxDiffs[i] = diff;
  //       }
  //     }
  //     if (ts - startTime < 3000) {
  //       requestAnimationFrame(detectLoop);
  //     } else {
  //       const max = Math.max(...maxDiffs);
  //       const axisIdx = maxDiffs.findIndex(v => v === max);
  //       setMaxAxis(axisIdx);
  //       setMaxDelta(max);
  //       setDetecting(false);
  //     }
  //   }
  //   requestAnimationFrame(detectLoop);
  // };

  const handleDetectAxis = (ctrlKey) => {
    if (!gamepads[selectedIndex]) return;
    setDetectingKey(ctrlKey);
    const gamepad = gamepads[selectedIndex];
    const axesCount = gamepad.axes.length;
    const startValues = [...gamepad.axes];
    let bound = false;

    function detectLoop() {
      const nowPad = navigator.getGamepads()[gamepad.index];
      if (nowPad && !bound) {
        for (let i = 0; i < axesCount; i++) {
          if (Math.abs(nowPad.axes[i] - startValues[i]) > 0.2) { // 靈敏度門檻
            setAxisMapping(prev => {
              const updated = { ...prev, [ctrlKey]: i };
              saveSettings(updated, btnMapping);
              return updated;
            });
            setDetectingKey(null);
            bound = true;
            return;
          }
        }
        requestAnimationFrame(detectLoop);
      } else if (!bound) {
        requestAnimationFrame(detectLoop);
      }
    }
    requestAnimationFrame(detectLoop);
  };

  const handleDetectBtns = (ctrlKey) => {
    if (!gamepads[selectedIndex]) return;
    setDetectingKey(ctrlKey);
    const gamepad = gamepads[selectedIndex];
    const buttonsCount = gamepad.buttons.length;
    const startValues = gamepad.buttons.map(btn => btn.value);
    let bound = false;

    function detectLoop() {
      const nowPad = navigator.getGamepads()[gamepad.index];
      if (nowPad && !bound) {
        for (let i = 0; i < buttonsCount; i++) {
          if (Math.abs(nowPad.buttons[i].value - startValues[i]) > 0.2) { // 靈敏度門檻
            setBtnMapping(prev => {
              const updated = { ...prev, [ctrlKey]: i };
              saveSettings(axisMapping, updated);
              return updated;
            });
            setDetectingKey(null);
            bound = true;
            return;
          }
        }
        requestAnimationFrame(detectLoop);
      } else if (!bound) {
        requestAnimationFrame(detectLoop);
      }
    }
    requestAnimationFrame(detectLoop);
  }

  function saveSettings(newAxis, newBtn) {
    localStorage.setItem('axisMapping', JSON.stringify(newAxis));
    localStorage.setItem('btnMapping', JSON.stringify(newBtn));
  }

  return (
    <div id='aaaaaaaaaaaa' style={{ width: '100%', height: '100%' }}>
      <div style={{ width: '100%', height: '63vh', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flex: '1'}}>
        {/* 左邊設定 */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: '1', width: '50%', height: '100%', alignItems: 'center', justifyContent: 'center'}}>
          <div className="settings" id="joystick-list">
            <h1 style={{ justifyContent: 'left' }}>Joystick List</h1>
            <select
              value={selectedIndex}
              onChange={(e) => setSelectedIndex(e.target.value)}
            >
              <option value="">Joystick:</option>
              {gamepads.map((pad, idx) => (
                <option key={pad.id} value={idx}>
                  {pad.id}
                </option>
              ))}
            </select>
          </div>

          {controlAxes.map(ctrl => (
            <div className='settings' key={ctrl.key}>
              <h1 style={{ justifyContent: 'left' }}>{ctrl.label}</h1>
              <button
                onClick={() => handleDetectAxis(ctrl.key)}
                disabled={detectingKey !== null || !gamepads[selectedIndex]}
              >
                {detectingKey === ctrl.key ? '偵測中...' : '偵測搖桿軸'}
              </button>
              <span style={{ marginLeft: '12px' }}>
                {axisMapping[ctrl.key] !== null ? `已綁定搖桿軸：${axisMapping[ctrl.key]}` : '尚未綁定'}
              </span>
            </div>
          ))}
        </div>

        {/* 右邊設定 */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: '1', width: '50%', height: '100%', alignItems: 'center', justifyContent: 'center'}}>
          {controlBtns.map(ctrl => (
            <div className='settings' key={ctrl.key}>
              <h1 style={{ justifyContent: 'left' }}>{ctrl.label}</h1>
              <button
                onClick={() => handleDetectBtns(ctrl.key)}
                disabled={detectingKey !== null || !gamepads[selectedIndex]}
              >
                {detectingKey === ctrl.key ? '偵測中...' : '偵測按鈕'}
              </button>
              <span style={{ marginLeft: '12px' }}>
                {btnMapping[ctrl.key] !== null ? `已綁定按鈕：${btnMapping[ctrl.key]}` : '尚未綁定'}
              </span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
};
export default JoystickSetting;
