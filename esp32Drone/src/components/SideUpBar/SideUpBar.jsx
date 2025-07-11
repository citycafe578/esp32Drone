import { useEffect, useState } from 'react';
import './SideUpBar.css';

const SideUpBar = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && <div className="overlay" />}
      <div className={`bottom-sheet ${open ? 'open' : ''}`}>
        <div className="drag-handle" onClick={() => setOpen(!open)}>
          <div className="handle-bar" />
        </div>
        <div className="sheet-content">

          <div style={{width: "100%", height: "5%", display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            <h2>Autopilot Settings</h2>
          </div>

          <div style={{display: 'flex', flexDirection: 'row', width: '100%', height: '95%'}}>
            <div id='auto_pilot_map'>
              <h1>Autopilot Map</h1>
            </div>

            <div id='waypoint_setting'>
              <div id='save_and_cancel_btns_bar' style={{display: 'flex', flexDirection: 'row', width: '100%', height: '10%', alignItems: 'center', justifyContent: 'space-between'}}>
                <button className='save_and_cancel_btns'>Save</button>
                <button className='save_and_cancel_btns'>Cancel</button>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </>
  );
};

export default SideUpBar;