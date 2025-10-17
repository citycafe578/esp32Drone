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
        imageVerticalFlip: String(parsed.imageVerticalFlip) === "true" ? "True" : "False",
        maximumCruisingAltitude: parsed.maximumCruisingAltitude || "",
        geoFenceRadius: parsed.geoFenceRadius || "",
        autoReturnHome: parsed.autoReturnHome || "False",
        autoLanding: parsed.autoLanding || "False"
      };
    }
    return {
      minimumCruisingAltitude: "OFF",
      lowAltitudeWarning: "OFF",
      imageHorizontalFlip: "False",
      imageVerticalFlip: "False",
      matchMediamumCruisingAltitude: "2",
      geoFenceRadius: "OFF",
      autoReturnHome: "OFF",
      autoLanding: "OFF"
    };
  };

  const initSettings = getInitDroneSettings();

  const [minimumCruisingAltitude, setMinimumCruisingAltitude] = useState(initSettings.minimumCruisingAltitude);
  const [lowAltitudeWarning, setLowAltitudeWarning] = useState(initSettings.lowAltitudeWarning);
  const [imageHorizontalFlip, setImageHorizontalFlip] = useState(initSettings.imageHorizontalFlip);
  const [imageVerticalFlip, setImageVerticalFlip] = useState(initSettings.imageVerticalFlip);
  const [cameraChecked, setCameraChecked] = useState(false);
  const [maximumCruisingAltitude, setMaximumCruisingAltitude] = useState(initSettings.maximumCruisingAltitude);
  const [geoFenceRadius, setGeoFenceRadius] = useState(initSettings.geoFenceRadius);
  const [autoReturnHome, setAutoReturnHome] = useState(initSettings.autoReturnHome);
  const [autoLanding, setAutoLanding] = useState(initSettings.autoLanding);

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("droneSettings"));
    if (saved) {
      setMinimumCruisingAltitude(saved.minimumCruisingAltitude || "OFF");
      setLowAltitudeWarning(saved.lowAltitudeWarning || "OFF");
      setImageHorizontalFlip(saved.imageHorizontalFlip === "True" ? "True" : "False");
      setImageVerticalFlip(saved.imageVerticalFlip === "True" ? "True" : "False");
      setAutoReturnHome(saved.autoReturnHome === "True" ? "True" : "False");
      setMaximumCruisingAltitude(saved.maximumCruisingAltitude || "");
      setGeoFenceRadius(saved.geoFenceRadius || "");
      setAutoLanding(saved.autoLanding === "True" ? "True" : "False");
    }
  }, []);

  useEffect(() => {
    const settings = {
      minimumCruisingAltitude,
      lowAltitudeWarning,
      imageHorizontalFlip,
      imageVerticalFlip,
      maximumCruisingAltitude,
      geoFenceRadius,
      autoReturnHome,
      autoLanding
    };
    localStorage.setItem("droneSettings", JSON.stringify(settings));
    fetch('http://localhost:5000/set_drone_settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        minimumCruisingAltitude,
        lowAltitudeWarning,
        imageHorizontalFlip: imageHorizontalFlip === "True",
        imageVerticalFlip: imageVerticalFlip === "True",
        maximumCruisingAltitude,
        geoFenceRadius,
        autoReturnHome,
        autoLanding
      })
    });
  }, [minimumCruisingAltitude, lowAltitudeWarning, imageHorizontalFlip, imageVerticalFlip, maximumCruisingAltitude, geoFenceRadius, autoReturnHome, autoLanding]);

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
            <option value="False">False</option>
            <option value="True">True</option>
          </select>
        </div>

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

        <div className="settings">
          <h1 style={{ justifyContent: 'left' }}>Auto Return Home</h1>
          <select
            value={autoReturnHome}
            onChange={(e) => setAutoReturnHome(e.target.value)}
          >
            <option value="False">OFF</option>
            <option value="True">ON</option>
          </select>
        </div>
      </div>

      {/* 右邊 */}
      <div className='column_bar'>

        <div className='settings'>
          <h1>Maximum Cruising Altitude (cm)</h1>
          <select
            value={maximumCruisingAltitude}
            onChange={(e) => setMaximumCruisingAltitude(e.target.value)}
          >
            <option>OFF</option>
            <option>200</option>
            <option>500</option>
            <option>1000</option>
            <option>1500</option>
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

        <div className="settings">
          <h1 style={{ justifyContent: 'left' }}>Geo Fence Radius (m)</h1>
          <select
            value={geoFenceRadius}
            onChange={(e) => setGeoFenceRadius(e.target.value)}
          >
            <option>OFF</option>
            <option>25</option>
            <option>50</option>
            <option>75</option>
            <option>100</option>
          </select>
        </div>

        <div className="settings">
          <h1 style={{ justifyContent: 'left' }}>Auto Landing</h1>
          <select
            value={autoLanding}
            onChange={(e) => setAutoLanding(e.target.value)}
          >
            <option value="False">OFF</option>
            <option value="True">ON</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default DroneSetting;
