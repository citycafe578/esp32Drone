import { useState, useEffect } from 'react';
import './OtherSetting.css';
import '../JoystickSetting/JoystickSetting.css';

const OtherSetting = () => {
  const [imageTransmission, setImageTransmission] = useState('');
  const [reciver, setReciver] = useState('');
  const [cameras, setCameras] = useState([]);
  const [cameraChecked, setCameraChecked] = useState(false);


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
    <div style={{ height: '63vh', width: '100%', backgroundColor: 'green', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
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
      </div>
    </div>
  );
};
export default OtherSetting;
