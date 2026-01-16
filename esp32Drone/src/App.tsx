import { useEffect, useState, FC, ReactNode } from 'react'
import './App.css'
import SideUpBar from './components/SideUpBar/SideUpBar'
import MapComponent from './components/MapComponent/MapComponent'
import SettingBtn from './components/Setting_btn/Setting_btn'
import JoystickSetting from './components/settings/JoystickSetting/JoystickSetting'
import DroneSetting from './components/settings/DroneSetting/DroneSetting'
import FlightRecords from './components/settings/FlightRecords/FlightRecords'
import OtherSetting from './components/settings/OtherSetting/OtherSetting.tsx'

interface OtherDataItemProps {
  title: string
  return_data: string
}

const OtherDataItem: FC<OtherDataItemProps> = ({ title, return_data }) => {
  return (
    <div className='other_item' style={{ display: 'flex', flexDirection: 'column', backgroundColor: 'gray', width: '20%', height: '100%', margin: '15px', borderRadius: '10px' }}>
      <div style={{ display: 'flex', width: '100%', height: '150px', alignItems: 'center', justifyContent: 'center' }}>
        <h2>{title}</h2>
      </div>
      <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <h1>{return_data}</h1>
      </div>
    </div>
  )
}

interface SettingEntryProps {
  title: string
  image: string
  onClick: () => void
}

const Setting_entry: FC<SettingEntryProps> = ({ title, image, onClick }) => {
  return (
    <button onClick={onClick} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '24%', aspectRatio: '1 / 1', margin: '0.5%', borderRadius: '10px', backgroundColor: 'gray' }}>
      <img src={image} alt={title} style={{ width: '50px', height: '50px' }} />
      <h3>{title}</h3>
    </button>
  )
}

interface GamepadData {
  id: string
  axes: number[]
  buttons: number[]
}

interface SettingEntry {
  key: string
  title: string
  image: string
}

const App: FC = () => {
  const [sideUpBarOpen, setSideUpBarOpen] = useState<boolean>(false)
  const [showSetting, setShowSetting] = useState<boolean>(false)
  const [settingPage, setSettingPage] = useState<string>('')
  const [joystickLiveData, setJoystickLiveData] = useState<GamepadData[]>([])

  const settingEntries: SettingEntry[] = [
    { key: 'joystick', title: 'Joystick Settings', image: '/joystick.png' },
    { key: 'drone', title: 'Drone Settings', image: '/drone.png' },
    { key: 'flight', title: 'Flight Records', image: '/folder.png' },
    { key: 'other', title: 'Other Settings', image: '/gear.png' },
  ]

  const renderSettingContent = (): ReactNode => {
    switch (settingPage) {
      case 'joystick':
        return <JoystickSetting />
      case 'drone':
        return <DroneSetting />
      case 'flight':
        return <FlightRecords />
      case 'other':
        return <OtherSetting />
      default:
        return (
          <div className="setting-entries" style={{ display: 'flex', justifyContent: 'space-between', flexDirection: 'row', height: '70vh', width: '100%', flexWrap: 'wrap', alignItems: 'center' }}>
            {settingEntries.map(entry => (
              <Setting_entry
                key={entry.key}
                title={entry.title}
                image={entry.image}
                onClick={() => setSettingPage(entry.key)}
              />
            ))}
          </div>
        )
    }
  }

  useEffect(() => {
    let rafId: number
    function updateLive(): void {
      const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) as Gamepad[] : []
      const data: GamepadData[] = pads.map(pad => ({
        id: pad.id,
        axes: [...pad.axes],
        buttons: pad.buttons.map(btn => btn.value)
      }))
      setJoystickLiveData(data)
      const stream_words = document.getElementById('stream')
      // debug mode
      // stream_words.innerHTML = JSON.stringify(data, null, 2);

      const axisMapping = JSON.parse(localStorage.getItem('axisMapping') || '{}') as Record<string, number | null>
      const joystickIndex = (JSON.parse(localStorage.getItem('joystickIndex') || '0')) as number
      let result = ''
      if (data[joystickIndex]) {
        Object.entries(axisMapping).forEach(([key, axisIdx]) => {
          if (axisIdx !== null && data[joystickIndex].axes[axisIdx] !== undefined) {
            result += `${key}: ${data[joystickIndex].axes[axisIdx].toFixed(3)}<br>`
          }
        })
        result = `<b>Joystick: ${data[joystickIndex].id}</b><br>` + result
      }
      const btnMapping = JSON.parse(localStorage.getItem('btnMapping') || '{}') as Record<string, number | null>
      if (data[joystickIndex]) {
        Object.entries(btnMapping).forEach(([key, btnIdx]) => {
          if (btnIdx !== null && data[joystickIndex].buttons[btnIdx] !== undefined) {
            result += `${key}: ${data[joystickIndex].buttons[btnIdx]}<br>`
          }
        })
      }
      // stream_words.innerHTML = result || '尚未綁定'; // debug mode
      // 肏我討厭JS甚麼鬼邏輯
      // 比python還要玄
      // 一堆奇怪的語法
      // 我直接用AI生成還比較快

      // console.log(data)
      rafId = requestAnimationFrame(updateLive)
    }
    updateLive()
    return () => cancelAnimationFrame(rafId)
  }, [])

  return (
    <div id="app-wrapper" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div id='digital_display'>
        <div id='stream' className='digital_item'>
          {/* <h1>stream</h1> */}
          <img src="http://localhost:5000/video_feed" alt="camera" style={{ height: '100%', width: '100%', borderRadius: '10px' }} />
        </div>
        <div id='map' className='digital_item'>
          {!sideUpBarOpen && <MapComponent />}
        </div>
      </div>
      <div id='other_display' style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', width: '100%', height: '20vh' }}>
        <OtherDataItem title='COURSE' return_data=' ' />
        <OtherDataItem title='HEIGHT' return_data=' ' />
        <OtherDataItem title='123' return_data=' ' />
        <OtherDataItem title='456' return_data=' ' />
        <OtherDataItem title='789' return_data=' ' />
      </div>
      <SideUpBar open={sideUpBarOpen} setOpen={setSideUpBarOpen} />
      <SettingBtn onClick={() => { setShowSetting(true); setSettingPage(''); }} />
      {showSetting && (
        <div className="setting-overlay">
          <div className="setting-modal">
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: '5vh' }}>
              <h2>
                {settingPage === ''
                  ? 'Settings'
                  : settingEntries.find(e => e.key === settingPage)?.title || 'Settings'}
              </h2>
              {settingPage === ''
                ? <button onClick={() => setShowSetting(false)} style={{ backgroundColor: 'transparent' }}><img src='/close.png' alt="設定" className='close_btn_pic'></img></button>
                : <button onClick={() => setSettingPage('')} style={{ backgroundColor: 'transparent' }} ><img src='/close.png' alt="設定" className='close_btn_pic'></img></button>
              }
            </div>
            {renderSettingContent()}
          </div>
        </div>
      )}
    </div>
  )
}

export default App;
