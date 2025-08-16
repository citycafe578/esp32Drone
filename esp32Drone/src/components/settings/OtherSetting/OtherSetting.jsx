import { useState } from 'react';
import './OtherSetting.css';
import '../JoystickSetting/JoystickSetting.css';


const OtherSetting = () => {
  const [imageTransmission, setImageTransmission] = useState('');
  return (
    <div style={{ height: '63vh', width: '100%', backgroundColor: 'green', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      {/* 左邊 */}
      <div className='column_bar'>
        <div className='settings'>
          <h1 style={{ justifyContent: 'left' }}>Image Transmission</h1>
          <select
            value={selectedIndex}
            onChange={(e) => setSelectedIndex(e.target.value)}
          >
            <option value="">Image Transmission:</option>

          </select>
        </div>
      </div>
      {/* 右邊 */}
      <div className='column_bar'>
        <h1>Other Settings</h1>
      </div>
    </div>
  );
};
export default OtherSetting;
