import { useState, useEffect } from 'react';
import './OtherSetting.css';
import '../JoystickSetting/JoystickSetting.css';

const OtherSetting = () => {
  const [imageTransmission, setImageTransmission] = useState(() => {
    return JSON.parse(localStorage.getItem('imageTransmission')) || '';
  });
  const [reciver, setReciver] = useState(() => {
    return JSON.parse(localStorage.getItem('reciver')) || '';
  });
  const [cameras, setCameras] = useState([]);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(() => navigator.mediaDevices.enumerateDevices())
      .then(devices => {
        const videoInputs = devices.filter(device => device.kind === 'videoinput');
        setCameras(videoInputs);
      })
      .catch(err => {
        console.error('No device:', err);
      });
  }, []);

  useEffect(() => {
    localStorage.setItem('imageTransmission', JSON.stringify(imageTransmission));
  }, [imageTransmission]);

  useEffect(() => {
    localStorage.setItem('reciver', JSON.stringify(reciver));
  }, [reciver]);

  return (
    <div style={{ height: '63vh', width: '100%', backgroundColor: 'green', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      {/* 左邊 */}
      <div className='column_bar'>
        <div className='settings'>
          <h1 style={{ justifyContent: 'left' }}>Image Transmission</h1>
          <select
            value={imageTransmission}
            onChange={(e) => setImageTransmission(e.target.value)}
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
      </div>
      {/* 右邊 */}
      <div className='column_bar'>
        <div className='settings'>
          <h1 style={{ justifyContent: 'left' }}>Reciver</h1>
          <select
            value={reciver}
            onChange={(e) => setReciver(e.target.value)}
          >
            <option value="">Reciver:</option>
          </select>
        </div>
      </div>
    </div>
  );
};
export default OtherSetting;
