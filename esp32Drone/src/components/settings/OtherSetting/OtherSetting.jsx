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
        LAWSE: parsed.LAWSE || "1"
      };
    }

    return {
      imageTransmission: "",
      reciver: "",
      LAWSE: "1"
    }
  };

  const initSettings = getInitOtherSettings();

  const [imageTransmission, setImageTransmission] = useState(initSettings.imageTransmission);
  const [reciver, setReciver] = useState(initSettings.reciver);
  const [cameras, setCameras] = useState([]);
  const [cameraChecked, setCameraChecked] = useState(false);
  const [LAWSE, setLAWSE] = useState(initSettings.LAWSE);

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("otherSettings"));
    if (saved) {
      setImageTransmission(saved.imageTransmission || "");
      setReciver(saved.reciver || "");
      setLAWSE(saved.LAWSE || "1");
    }
  }, []);

  useEffect(() => {
    const settings = {
      imageTransmission,
      reciver,
      LAWSE
    };
    localStorage.setItem("otherSettings", JSON.stringify(settings));
  }, [imageTransmission, reciver, LAWSE]);


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

        <div className='settings'>
          <h1 style={{ justifyContent: 'left' }}>Low Altitude Warning Sound Effect</h1> {/* LAWSE */}
          <select
            value={LAWSE}
            onChange={(e) => setLAWSE(e.target.value)}
            style={{ justifyContent: 'right' }}
          >
            <option>1</option>
            <option>2</option>
            <option>3</option>
            <option>4</option>
            <option>5</option>

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

      {/* <div className='settings'>
          <h1>Image Horizontal Flip</h1>
          <select
            value={imageHorizontalFlip}
            onChange={(e) => setImageHorizontalFlip(e.target.value)}
          >
            <option>False</option>
            <option>True</option>
          </select>
        </div> */}
    </div>
  );
};
export default OtherSetting;
