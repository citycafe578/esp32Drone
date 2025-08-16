import { useState } from 'react';
import './OtherSetting.css';
import '../JoystickSetting/JoystickSetting.css';


const OtherSetting = () => {
  const [imageTransmission, setImageTransmission] = useState('');
  const [reciver, setReciver] = useState('');

  function saveSettings() {
    localStorage.setItem('imageTransmission', JSON.stringify(imageTransmission));
    localStorage.setItem('reciver', JSON.stringify(reciver))
  }

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
