import { useEffect, useState } from 'react'
import './App.css'
import SideUpBar from './components/SideUpBar/SideUpBar.jsx';
import MapComponent from './components/MapComponent/MapComponent.jsx';
import SettingBtn from './components/Setting_btn/Setting_btn.jsx';
import JoystickSetting from './components/settings/JoystickSetting/JoystickSetting.jsx';
import DroneSetting from './components/settings/DroneSetting/DroneSetting.jsx';
import FlightRecords from './components/settings/FlightRecords/FlightRecords.jsx';
import OtherSetting from './components/settings/OtherSetting/OtherSetting.jsx';

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

const Setting_entry = ({title, image, onClick}) => {
  return(
    <button onClick={onClick} style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '350px', height: '350px', margin: '15px', borderRadius: '10px', backgroundColor: 'gray'}}>
      <img src={image} alt={title} style={{width: '50px', height: '50px'}} />
      <h3>{title}</h3>
    </button>
  )
}

const App = () => {
  const [sideUpBarOpen, setSideUpBarOpen] = useState(false);
  const [showSetting, setShowSetting] = useState(false);
  const [settingPage, setSettingPage] = useState('');

  const settingEntries = [
    { key: 'joystick', title: 'Joystick Setting', image: '/joystick.png' },
    { key: 'drone', title: 'Drone Setting', image: '/drone.png' },
    { key: 'flight', title: 'Flight Records', image: '/folder.png' },
    { key: 'other', title: 'Other Setting', image: '/gear.png' },
  ];
  
  const renderSettingContent = () => {
    switch (settingPage) {
      case 'joystick':
        return <JoystickSetting />;
      case 'drone':
        return <DroneSetting />;
      case 'flight':
        return <FlightRecords />;
      case 'other':
        return <OtherSetting />;
      default:
        return (
          <div className="setting-entries" style={{display: 'flex', justifyContent: 'space-between', flexDirection: 'row'}}>
            {settingEntries.map(entry => (
              <Setting_entry
                key={entry.key}
                title={entry.title}
                image={entry.image}
                onClick={() => setSettingPage(entry.key)}
              />
            ))}
          </div>
        );
    }
  };

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
      <SettingBtn onClick={() => { setShowSetting(true); setSettingPage(''); }}/>
      {showSetting && (
        <div className="setting-overlay">
          <div className="setting-modal">
            <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: '100%'}}>
              <h2>
                {settingPage === ''
                  ? 'Settings'
                  : settingEntries.find(e => e.key === settingPage)?.title || 'Settings'}
              </h2>
              {settingPage === ''
                ? <button onClick={() => setShowSetting(false)}>close</button>
                : <button onClick={() => setSettingPage('')}>back</button>
              }
            </div>
            {renderSettingContent()}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
