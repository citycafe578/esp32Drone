import { useState, useEffect } from 'react';
import './DroneSetting.css';
import '../JoystickSetting/JoystickSetting.css';
import '../../../App.css';

const DroneSetting = () => {
  const getInitDroneSettings = () => {
    const local = localStorage.getItem("droneSettings");
    if (local) {
      const parsed = JSON.parse(local);
      return {
        minimumCruisingAltitude: parsed.minimumCruisingAltitude || "OFF",
        lowAltitudeWarning: parsed.lowAltitudeWarning || "OFF",
        imageHorizontalFlip: String(parsed.imageHorizontalFlip) === "true" ? "True" : "False",
        imageVerticalFlip: String(parsed.imageVerticalFlip) === "true" ? "True" : "False"
      };
    }
    return {
      minimumCruisingAltitude: "OFF",
      lowAltitudeWarning: "OFF",
      imageHorizontalFlip: "False",
      imageVerticalFlip: "False"
    };
  };

  const initSettings = getInitDroneSettings();

  const [minimumCruisingAltitude, setMinimumCruisingAltitude] = useState(initSettings.minimumCruisingAltitude);
  const [lowAltitudeWarning, setLowAltitudeWarning] = useState(initSettings.lowAltitudeWarning);
  const [imageHorizontalFlip, setImageHorizontalFlip] = useState(initSettings.imageHorizontalFlip);
  const [imageVerticalFlip, setImageVerticalFlip] = useState(initSettings.imageVerticalFlip);
  const [cameraChecked, setCameraChecked] = useState(false);

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("droneSettings"));
    if (saved) {
      setMinimumCruisingAltitude(saved.minimumCruisingAltitude || "OFF");
      setLowAltitudeWarning(saved.lowAltitudeWarning || "OFF");
      setImageHorizontalFlip(
        String(saved.imageHorizontalFlip) === "true" ? "True" : "False"
      );
      setImageVerticalFlip(
        String(saved.imageVerticalFlip) === "true" ? "True" : "False"
      );
    }
  }, []);

  useEffect(() => {
    const settings = {
      minimumCruisingAltitude,
      lowAltitudeWarning,
      imageHorizontalFlip,
      imageVerticalFlip
    };
    localStorage.setItem("droneSettings", JSON.stringify(settings));
    fetch('http://localhost:5000/set_drone_settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        minimumCruisingAltitude,
        lowAltitudeWarning,
        imageHorizontalFlip: imageHorizontalFlip === "True",
        imageVerticalFlip: imageVerticalFlip === "True"
      })
    });
  }, [minimumCruisingAltitude, lowAltitudeWarning, imageHorizontalFlip, imageVerticalFlip]);

  useEffect(() => {
    if (cameraChecked) {
      fetch('http://localhost:5000/pause_camera', { method: 'POST' });
      return () => {
        fetch('http://localhost:5000/resume_camera', { method: 'POST' });
      };
    }
  }, [cameraChecked]);

  useEffect(() => {
    setCameraChecked(true);
  }, []);

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

        <div className='settings'>
          <h1>Image Horizontal Flip</h1>
          <select
            value={imageHorizontalFlip}
            onChange={(e) => setImageHorizontalFlip(e.target.value)}
          >
            <option>False</option>
            <option>True</option>
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

        <div className='settings'>
          <h1>Image Vertical Flip</h1>
          <select
            value={imageVerticalFlip}
            onChange={(e) => setImageVerticalFlip(e.target.value)}
          >
            <option>False</option>
            <option>True</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default DroneSetting;
