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
 
  const [axisMapping, setAxisMapping] = useState({
    altitude: null,
    pitch: null,
    yaw: null,
    roll: null,
  });
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

  const handleDetectAxes = () => {
    if (!gamepads[selectedIndex]) return;
    setDetecting(true);
    setMaxAxis(null);
    setMaxDelta(null);
    const gamepad = gamepads[selectedIndex];
    const axesCount = gamepad.axes.length;
    const startValues = [...gamepad.axes];
    const maxDiffs = Array(axesCount).fill(0);
    let startTime = null;

    function detectLoop(ts) {
      if (!startTime) startTime = ts;
      const nowPad = navigator.getGamepads()[gamepad.index];
      if (nowPad) {
        for (let i = 0; i < axesCount; i++) {
          const diff = Math.abs(nowPad.axes[i] - startValues[i]);
          if (diff > maxDiffs[i]) maxDiffs[i] = diff;
        }
      }
      if (ts - startTime < 3000) {
        requestAnimationFrame(detectLoop);
      } else {
        const max = Math.max(...maxDiffs);
        const axisIdx = maxDiffs.findIndex(v => v === max);
        setMaxAxis(axisIdx);
        setMaxDelta(max);
        setDetecting(false);
      }
    }
    requestAnimationFrame(detectLoop);
  };

  const handleDetectAxis = (ctrlKey) => {
    if (!gamepads[selectedIndex]) return;
    setDetectingKey(ctrlKey);
    const gamepad = gamepads[selectedIndex];
    const axesCount = gamepad.axes.length;
    const startValues = [...gamepad.axes];
    const maxDiffs = Array(axesCount).fill(0);
    let startTime = null;

    function detectLoop(ts) {
      if (!startTime) startTime = ts;
      const nowPad = navigator.getGamepads()[gamepad.index];
      if (nowPad) {
        for (let i = 0; i < axesCount; i++) {
          const diff = Math.abs(nowPad.axes[i] - startValues[i]);
          if (diff > maxDiffs[i]) maxDiffs[i] = diff;
        }
      }
      if (ts - startTime < 3000) {
        requestAnimationFrame(detectLoop);
      } else {
        const max = Math.max(...maxDiffs);
        const axisIdx = maxDiffs.findIndex(v => v === max);
        setAxisMapping(prev => ({ ...prev, [ctrlKey]: axisIdx }));
        setDetectingKey(null);
      }
    }
    requestAnimationFrame(detectLoop);
  };

  return (
    <div>
      <div className="settings">
        <h1>Joystick List</h1>
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
          <h1>{ctrl.label}</h1>
          <button
            onClick={() => handleDetectAxis(ctrl.key)}
            disabled={detectingKey !== null || !gamepads[selectedIndex]}
          >
            {detectingKey === ctrl.key ? '偵測中...' : '偵測搖桿軸'}
          </button>
          <span style={{marginLeft: '12px'}}>
            {axisMapping[ctrl.key] !== null ? `已綁定搖桿軸：${axisMapping[ctrl.key]}` : '尚未綁定'}
          </span>
        </div>
      ))}
    </div>
  );
};
export default JoystickSetting;
