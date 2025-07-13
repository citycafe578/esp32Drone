import { useEffect, useState } from 'react'
import './App.css'
import SideUpBar from './components/SideUpBar/SideUpBar.jsx';
import MapComponent from './components/MapComponent/MapComponent.jsx';
import SettingBtn from './components/Setting_btn/Setting_btn.jsx';

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

const Setting_entry = ({title, image}) => {
  return(
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '350px', height: '350px', margin: '15px', borderRadius: '10px', backgroundColor: 'gray'}}>
      <img src={image} alt={title} style={{width: '50px', height: '50px'}} />
      <h3>{title}</h3>
    </div>
  )
}

const App = () => {
  const [sideUpBarOpen, setSideUpBarOpen] = useState(false);
  const [showSetting, setShowSetting] = useState(false);
  return (
    <div id="app-wrapper" style={{display: 'flex', flexDirection: 'column',height: '100vh'}}>
      <div id='digital_display'>
        <div id='stream' className='digital_item'>
          <h1>stream</h1>
        </div>
        <div id='map' className='digital_item'>
          {!sideUpBarOpen && <MapComponent />}
        </div>
      </div>
      <div id='other_display' style={{display: 'flex', flexDirection: 'row', justifyContent: 'space-between', width: '100%'}}>
        <OtherDataItem title = 'COURSE' return_data = ' ' />
        <OtherDataItem title = 'HEIGHT' return_data = ' ' />
        <OtherDataItem title = '123' return_data = ' ' />
        <OtherDataItem title = '456' return_data = ' ' />
        <OtherDataItem title = '789' return_data = ' ' />
      </div>
      <SideUpBar open={sideUpBarOpen} setOpen={setSideUpBarOpen}/>
      <SettingBtn onClick={() => setShowSetting(true)}/>

      {showSetting && (
        <div className="setting-overlay">
          <div className="setting-modal">
            <h2>設定介面</h2>
            <button onClick={() => setShowSetting(false)}>關閉</button>
            <div className="setting-entries" style={{display: 'flex', justifyContent: 'space-between', flexDirection: 'row'}}>
              <Setting_entry title="Joystick Setting" image="/joystick.png" />
              <Setting_entry title="Drone Setting" image="/drone.png" />
              <Setting_entry title="Flight Records" image="/folder.png" />
              <Setting_entry title="Other Setting" image="/gear.png" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
