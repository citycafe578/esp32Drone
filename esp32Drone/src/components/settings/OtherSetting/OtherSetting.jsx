import { useState, useEffect } from 'react';  
import '../JoystickSetting/JoystickSetting.css';
import '../../../App.css';

const OtherSetting = () => {
  const getInitOtherSettings = () => {
    const local = localStorage.getItem("otherSettings");
    if (local) {
      const parsed = JSON.parse(local);
      return {
        imageTransmission: parsed.imageTransmission || "",
        reciver: parsed.reciver || "",
        transmissionPower: parsed.transmissionPower || "",
        LAWSE: parsed.LAWSE || "",
        sharpen: parsed.sharpen || "",
        grayscale: parsed.grayscale || ""
      };
    }
    return {
      imageTransmission: "",
      reciver: "",
      transmissionPower: "",
      LAWSE: "",
      sharpen: "",
      grayscale: ""
    }
  };

  const initSettings = getInitOtherSettings();
  const [imageTransmission, setImageTransmission] = useState(initSettings.imageTransmission);
  const [cameras, setCameras] = useState([]);
  const [reciver, setReciver] = useState(initSettings.reciver);
  const [ports, setPorts] = useState([]);
  const [transmissionPower, setTransmissionPower] = useState(initSettings.transmissionPower);
  const [LAWSE, setLAWSE] = useState(initSettings.LAWSE);
  const [sharpen, setSharpen] = useState(initSettings.sharpen);
  const [grayscale, setGrayscale] = useState(initSettings.grayscale);

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("otherSettings"));
    if (saved) {
      setImageTransmission(saved.imageTransmission || "");
      setReciver(saved.reciver || "");
      setTransmissionPower(saved.transmissionPower || "");
      setLAWSE(saved.LAWSE || "");
      setSharpen(saved.sharpen || "")
      setGrayscale(saved.grayscale || "");
    }
  }, []);

  useEffect(() => {
    const settings = {
      imageTransmission,
      reciver,
      transmissionPower,
      LAWSE,
      sharpen,
      grayscale
    };
    localStorage.setItem("otherSettings", JSON.stringify(settings));
  }, [imageTransmission, reciver, transmissionPower, LAWSE, sharpen, grayscale]);

  useEffect(() => {
    fetch('http://localhost:5000/list_cameras')
      .then(res => res.json())
      .then(data => {
        setCameras(data.cameras);
      })
      .catch(err => console.error('Error fetching cameras:', err));
  }, []);

  useEffect(() => {
    fetch('http://localhost:5000/get_ports')
      .then(res => res.json())
      .then(data => {
        setPorts(data.ports);
      })
      .catch(err => console.error('Error fetching ports:', err));
  }, []);

  const handleCameraChange = (e) => {
    const idx = e.target.value;
    setImageTransmission(idx);
    fetch('http://localhost:5000/set_camera', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageTransmission: idx })
    });
  };

  const handleReciverChange = (e) => {
    setReciver(e.target.value);
  };

  return (
    <div style={{ height: '63vh', width: '100%', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      {/* 左邊 */}
      <div className='column_bar'>
        <div className='settings'>
          <h1 style={{ justifyContent: 'left' }}>Image Transmission</h1>
          <select
            value={imageTransmission}
            onChange={handleCameraChange}
            style={{ justifyContent: 'right' }}
          >
            <option value="">Select Camera:</option>
            {cameras.map((idx) => (
              <option key={idx} value={idx}>
                Camera {idx}
              </option>
            ))}
          </select>
        </div>

        <div className='settings'>
          <h1 style={{ justifyContent: 'left' }}>Low Altitude Warning Sound Effect</h1>
          <select
            value={LAWSE}
            onChange={(e) => setLAWSE(e.target.value)}
            style={{ justifyContent: 'right' }}
          >
            <option>Sound Effect 1</option>
            <option>Sound Effect 2</option>
            <option>Sound Effect 3</option>
            <option>Sound Effect 4</option>
            <option>Sound Effect 5</option>
          </select>
        </div>

        <div className='settings'>
          <h1>Image Sharpen</h1>
          <select
            value={sharpen}
            onChange={(e) => setSharpen(e.target.value)}
          >
            <option value={0}>0%</option>
            <option value={25}>25%</option>
            <option value={50}>50%</option>
            <option value={75}>75%</option>
            <option value={100}>100%</option>
          </select>
        </div>
      </div>

      {/* 右邊 */}
      <div className='column_bar'>
        <div className='settings'>
          <h1 style={{ justifyContent: 'left' }}>Reciver</h1>
          <select
            value={reciver}
            onChange={handleReciverChange}
          >
            <option value="">Reciver:</option>
            {ports.map((port, idx) => (
              <option key={idx} value={port.device}>
                {port.device} - {port.name}
              </option>
            ))}
          </select>
        </div>

        <div className='settings'>
          <h1 style={{ justifyContent: 'left' }}>Transmission Power</h1>
          <select
            value={transmissionPower}
            onChange={(e) => setTransmissionPower(e.target.value)}
          >
            <option>Low</option>
            <option>High</option>
          </select>
        </div>

        <div className='settings'>
          <h1>Image Grayscale</h1>
          <select
            value={grayscale}
            onChange={(e) => setGrayscale(e.target.value)}
          >
            <option value={0}>0%</option>
            <option value={25}>25%</option>
            <option value={50}>50%</option>
            <option value={75}>75%</option>
            <option value={100}>100%</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default OtherSetting;
