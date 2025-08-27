import { useState, useEffect } from 'react';
import './DroneSetting.css';
import '../JoystickSetting/JoystickSetting.css';
import '../../../App.css';

const DroneSetting = () => {
  const getInitDroneSettings = () => {
    const local = localStorage.getItem("droneSettings");
    if (local) return JSON.parse(local);
    return {
      minimumCruisingAltitude: "OFF",
      lowAltitudeWarning: "OFF"
    };
  };

  const initSettings = getInitDroneSettings();

  const [minimumCruisingAltitude, setMinimumCruisingAltitude] = useState(initSettings.minimumCruisingAltitude);
  const [lowAltitudeWarning, setLowAltitudeWarning] = useState(initSettings.lowAltitudeWarning);

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("droneSettings"));
    if (saved) {
      setMinimumCruisingAltitude(saved.minimumCruisingAltitude || "OFF");
      setLowAltitudeWarning(saved.lowAltitudeWarning || "OFF");
    }
  }, []);

  useEffect(() => {
    const settings = { minimumCruisingAltitude, lowAltitudeWarning };
    localStorage.setItem("droneSettings", JSON.stringify(settings));
  }, [minimumCruisingAltitude, lowAltitudeWarning]);

  return (
    <div
      style={{
        height: '63vh',
        width: '100%',
        backgroundColor: 'green',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {/* 左邊 */}
      <div className='column_bar'>
        <div className='settings'>
          <h1>Minimum Cruising Altitude (cm)</h1>
          <select
            value={minimumCruisingAltitude}
            onChange={(e) => setMinimumCruisingAltitude(e.target.value)}
          >
            <option>OFF</option>
            <option>25</option>
            <option>50</option>
            <option>75</option>
            <option>100</option>
            <option>125</option>
            <option>150</option>
            <option>175</option>
            <option>200</option>
          </select>
        </div>
      </div>

      {/* 右邊 */}
      <div className='column_bar'>
        <div className='settings'>
          <h1>Low Altitude Warning (cm)</h1>
          <select
            value={lowAltitudeWarning}
            onChange={(e) => setLowAltitudeWarning(e.target.value)}
          >
            <option>OFF</option>
            <option>25</option>
            <option>50</option>
            <option>75</option>
            <option>100</option>
            <option>125</option>
            <option>150</option>
            <option>175</option>
            <option>200</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default DroneSetting;
