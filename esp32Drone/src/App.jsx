import { useEffect, useState } from 'react'
import './App.css'

const OtherDataItem = ({title, return_data}) => {
  return(
    <div className='other_item' style={{display: 'flex', flexDirection: 'column', backgroundColor: 'gray', width: '20%', height: '180px', margin: '15px', borderRadius: '10px'}}>
      <div style={{display: 'flex', width: '100%', height: '150px', alignItems: 'center', justifyContent: 'center'}}>
        <h2>{title}</h2>
      </div>
      <div style={{display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center'}}>
        <h1>return_data</h1>
      </div>
    </div>
  )
};

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

const AutoDriveBTN = () => {
  const [side, setSide] = useState(false) //左邊一般模式(false) 右邊自動駕駛介面(true)
  return(
    <div style={{width: "100vh", height: "100px", display: "flex", alignItems: 'center', justifyContent: 'center'}}>
      <h1>這裡先不用之後再搞</h1>
    </div>
  )
}

const App = () => {
  return (
    <div id="app-wrapper" style={{display: 'flex', flexDirection: 'column',height: '100vh'}}>
      <div id='digital_display'>
        <div id='stream' className='digital_item'>
          <h1>stream</h1>
        </div>
        <div id='map' className='digital_item'>
          <h1>map</h1>
        </div>
      </div>

      <div id='other_display' style={{display: 'flex', flexDirection: 'row', justifyContent: 'space-between', width: '100%'}}>
        <OtherDataItem title = 'COURSE' return_data = ' ' />
        <OtherDataItem title = 'HEIGHT' return_data = ' ' />
        <OtherDataItem title = '123' return_data = ' ' />
        <OtherDataItem title = '456' return_data = ' ' />
        <OtherDataItem title = '789' return_data = ' ' />
      </div>
      
      <SideUpBar/>
      
    </div>
  );
}

export default App;
