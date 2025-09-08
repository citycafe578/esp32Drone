import { useState, useEffect, use } from 'react';
import './OtherSetting.css';
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
  const [reciver, setReciver] = useState(initSettings.reciver);
  const [transmissionPower, setTransmissionPower] = useState(initSettings.transmissionPower);
  const [cameras, setCameras] = useState([]);
  const [cameraChecked, setCameraChecked] = useState(false);
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
  }, [imageTransmission, reciver,transmissionPower, LAWSE, sharpen, grayscale]);


  useEffect(() => {
    let stream;
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(s => {
        stream = s;
        return navigator.mediaDevices.enumerateDevices();
      })
      .then(devices => {
        const videoInputs = devices.filter(device => device.kind === 'videoinput');
        setCameras(videoInputs);
        setCameraChecked(true);
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
      })
      .catch(err => {
        console.error('No device:', err);
        setCameraChecked(true);
      });
  }, []);

  useEffect(() => {
    if (cameraChecked) {
      fetch('http://localhost:5000/pause_camera', { method: 'POST' });
      return () => {
        fetch('http://localhost:5000/resume_camera', { method: 'POST' });
      };
    }
  }, [cameraChecked]);

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
    const val = e.target.value;
    setReciver(val);

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
            <option value="">Image Transmission:</option>
            {cameras.map((cam, idx) => (
              <option key={cam.deviceId} value={idx}>
                {`[${idx}] `}{cam.label || `Camera ${cam.deviceId}`}
              </option>
            ))}
          </select>
        </div>

        <div className='settings'>
          <h1 style={{ justifyContent: 'left' }}>Low Altitude Warning Sound Effect</h1> {/* LAWSE */}
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
            <option value = {0}>0%</option>
            <option value = {25}>25%</option>
            <option value = {50}>50%</option>
            <option value = {75}>75%</option>
            <option value = {100}>100%</option>
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
          </select>
        </div>

        <div className='settings'>
            <h1 style ={{justifyContent: 'left'}}>Transmission Power</h1>
            <select
              value = {transmissionPower}
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
            <option value = {0}>0%</option>
            <option value = {25}>25%</option>
            <option value = {50}>50%</option>
            <option value = {75}>75%</option>
            <option value = {100}>100%</option>
          </select>
        </div>
      </div>
    </div>
  );
};
export default OtherSetting;
