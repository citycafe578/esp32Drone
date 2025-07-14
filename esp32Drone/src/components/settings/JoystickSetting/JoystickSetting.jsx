import { useEffect, useState } from 'react';
import './JoystickSetting.css';

const JoystickSetting = () => {
  const [gamepads, setGamepads] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [maxAxis, setMaxAxis] = useState(null);
  const [maxDelta, setMaxDelta] = useState(null);

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
  //       // 找最大變化軸
  //       const max = Math.max(...maxDiffs);
  //       const axisIdx = maxDiffs.findIndex(v => v === max);
  //       setMaxAxis(axisIdx);
  //       setMaxDelta(max);
  //       setDetecting(false);
  //     }
  //   }
  //   requestAnimationFrame(detectLoop);
  // };

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
        {/* <button onClick={handleDetectAxes} disabled={detecting || !gamepads[selectedIndex]}>
          {detecting ? '偵測中...' : '偵測搖桿軸'}
        </button>
        {maxAxis !== null && (
          <div style={{marginTop: '8px'}}>
            最大變化軸：{maxAxis}，變化值：{maxDelta.toFixed(3)}
          </div>
        )} */}
      </div>

      <div className='settings'>
        <h1>Altitude</h1>
      </div>

      <div className='settings'>
        <h1>Pitch</h1>
      </div>

      <div className='settings'>
        <h1>Yaw</h1>
      </div>

      <div className='settings'>
        <h1>Roll</h1>
      </div>
    </div>
  );
};
export default JoystickSetting;
