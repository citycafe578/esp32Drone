import { useEffect, useState, useRef, FC, ReactNode } from 'react'
import './index.css'
import './App.css'
import SideUpBar from './components/SideUpBar/SideUpBar'
import MapComponent from './components/MapComponent/MapComponent'
import SettingBtn from './components/Setting_btn/Setting_btn'
import JoystickSetting from './components/settings/JoystickSetting/JoystickSetting'
import DroneSetting from './components/settings/DroneSetting/DroneSetting'
import FlightRecords from './components/settings/FlightRecords/FlightRecords'
import OtherSetting from './components/settings/OtherSetting/OtherSetting.tsx'
import { socket } from './socket';

interface OtherDataItemProps {
  title: string
  return_data: string
}

const OtherDataItem: FC<OtherDataItemProps> = ({ title, return_data }) => {
  return (
    <div className='other_item'>
      <h2>{title}</h2>
      <h1>{return_data}</h1>
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
    <button className='setting-card' onClick={onClick}>
      <img src={image} alt={title} />
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
  const [status, setStatus] = useState('Disconnected');
  const lastEmitTime = useRef(0);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])


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
        return <OtherSetting theme={theme} setTheme={setTheme} />
      default:
        return (
          <div className="setting-entries">
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
    socket.connect();
    socket.on('status_update', (data: any) => {
      console.log('from flask:', data);
    });
    socket.on('connect', () => setStatus('Connected'));
    socket.on('disconnect', () => setStatus('Disconnected'));

    let rafId: number
    function updateLive(): void {
      const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) as Gamepad[] : []
      const data: GamepadData[] = pads.map(pad => ({
        id: pad.id,
        axes: [...pad.axes],
        buttons: pad.buttons.map(btn => btn.value)
      }))
      setJoystickLiveData(data)

      const axisMapping = JSON.parse(localStorage.getItem('axisMapping') || '{}') as Record<string, number | null>
      const btnMapping = JSON.parse(localStorage.getItem('btnMapping') || '{}') as Record<string, number | null>
      const joystickIndex = (JSON.parse(localStorage.getItem('joystickIndex') || '0')) as number
      const pad = data[joystickIndex]

      // 每 100ms emit 一次
      const now = Date.now()
      if (pad && now - lastEmitTime.current >= 100) {
        lastEmitTime.current = now

        const getAxis = (key: string): number => {
          const idx = axisMapping[key]
          return idx !== null && idx !== undefined ? (pad.axes[idx] ?? 0) : 0
        }
        const getBtn = (key: string): number => {
          const idx = btnMapping[key]
          return idx !== null && idx !== undefined ? (pad.buttons[idx] ?? 0) : 0
        }

        const throttle = Math.round(((getAxis('altitude') + 1) / 2) * 1000 + 1000)
        const pitch = Math.round(((getAxis('pitch') + 1) / 2) * 1000 + 1000)
        const yaw = Math.round(((getAxis('yaw') + 1) / 2) * 1000 + 1000)
        const roll = Math.round(((getAxis('roll') + 1) / 2) * 1000 + 1000)
        const estop = getBtn('emergency stop') > 0.5 ? 1 : 0
        const startup = getBtn('start up') > 0.5 ? 1 : 0
        const speedMode = getBtn('speed mode') > 0.5 ? 1 : 0
        const obstacleAvoidance = getBtn('obstacle avoidance') > 0.5 ? 1 : 0
        const stillDontKnow = getBtn('still dont know') > 0.5 ? 1 : 0

        socket.emit('control_signal', {
          throttle, pitch, yaw, roll,
          emergency_stop: estop,
          start_up: startup,
          speed_mode: speedMode,
          obstacle_avoidance: obstacleAvoidance,
          still_dont_know: stillDontKnow,
        })
      }

      rafId = requestAnimationFrame(updateLive)
    }
    updateLive()
    return () => {
      cancelAnimationFrame(rafId)
      socket.off('status_update');
      socket.off('connect');
      socket.off('disconnect');
      socket.disconnect();
    }
  }, [])

  return (
    <div id="app-wrapper" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div id='digital_display'>
        <div id='stream' className='digital_item'>
          {/* <h1>stream</h1>   //debug mode 需註解*/}
          <img src="http://localhost:5000/video_feed" alt="camera" style={{ height: '100%', width: '100%', borderRadius: '10px' }} />
        </div>
        <div id='map' className='digital_item'>
          {!sideUpBarOpen && <MapComponent />}
        </div>
      </div>
      <div id='other_display'>
        <OtherDataItem title='COURSE' return_data=' ' />
        <OtherDataItem title='HEIGHT' return_data=' ' />
        <OtherDataItem title='ROLL' return_data=' ' />
        <OtherDataItem title='PITCH' return_data=' ' />
        <OtherDataItem title='THROTTLE' return_data=' ' />
      </div>
      <SideUpBar open={sideUpBarOpen} setOpen={setSideUpBarOpen} />
      <SettingBtn onClick={() => { setShowSetting(true); setSettingPage(''); }} />
      {showSetting && (
        <div className="setting-overlay">
          <div className="setting-modal">
            <div className='modal-header'>
              <h2>
                {settingPage === ''
                  ? 'Settings'
                  : settingEntries.find(e => e.key === settingPage)?.title || 'Settings'}
              </h2>
              {settingPage === ''
                ? <button className='close-btn' onClick={() => setShowSetting(false)}><img src='/close.png' alt="關閉" className='close_btn_pic'></img></button>
                : <button className='close-btn' onClick={() => setSettingPage('')}><img src='/close.png' alt="返回" className='close_btn_pic'></img></button>
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
