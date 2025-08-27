import './DroneSetting.css';
import '../JoystickSetting/JoystickSetting.css';
import '../../../App.css';

const DroneSetting = () => {
  return(
    <div style={{ height: '63vh', width: '100%', backgroundColor: 'green', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      {/* 左邊 */}
      <div className='column_bar'>
        <div className='settings'>
          <h1 style={{ justifyContent: 'left' }}>Minimum Cruising Altitude</h1>
          <select>
            <option>0.25</option>
            <option>0.50</option>
            <option>0.75</option>
            <option>1.00</option>
            <option>1.25</option>
            <option>1.50</option>
            <option>1.75</option>
            <option>2.00</option>
          </select>
        </div>
      </div>
      {/* 右邊 */}
      <div className='column_bar'>
        <div className='settings'>
          <h1 style={{ justifyContent: 'left' }}>Low Altitude Warning</h1>
          <select>
            <option>0.25</option>
            <option>0.50</option>
            <option>0.75</option>
            <option>1.00</option>
            <option>1.25</option>
            <option>1.50</option>
            <option>1.75</option>
            <option>2.00</option>
          </select>
        </div>
      </div>
    </div>
  );
};
export default DroneSetting;
