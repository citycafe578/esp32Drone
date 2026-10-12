import { useEffect, useMemo, useState } from 'react'
import type { FC, ReactNode } from 'react'
import './index.css'
import './App.css'
import { API_BASE } from './config'
import { loadSettings } from './settingsStore'
import { useGamepadControl } from './hooks/useGamepadControl'
import { useBridge } from './hooks/useBridge'
import { useWaypoints } from './hooks/useWaypoints'
import { useWarnings } from './hooks/useWarnings'
import SideUpBar from './components/SideUpBar/SideUpBar'
import MapComponent from './components/MapComponent/MapComponent'
import SettingBtn from './components/Setting_btn/Setting_btn'
import Hud from './components/Hud/Hud'
import JoystickSetting from './components/settings/JoystickSetting/JoystickSetting'
import DroneSetting from './components/settings/DroneSetting/DroneSetting'
import FlightRecords from './components/settings/FlightRecords/FlightRecords'
import TuningSetting from './components/settings/TuningSetting/TuningSetting'
import OtherSetting from './components/settings/OtherSetting/OtherSetting'
import { formatDistance } from './lib/geo'

interface OtherDataItemProps {
  title: string
  return_data: string
}

const OtherDataItem: FC<OtherDataItemProps> = ({ title, return_data }) => (
  <div className='other_item'>
    <h2>{title}</h2>
    <h1>{return_data}</h1>
  </div>
)

interface SettingEntryProps {
  title: string
  image: string
  onClick: () => void
}

const Setting_entry: FC<SettingEntryProps> = ({ title, image, onClick }) => (
  <button className='setting-card' onClick={onClick}>
    <img src={image} alt={title} />
    <h3>{title}</h3>
  </button>
)

interface SettingEntry {
  key: string
  title: string
  image: string
}

const SETTING_ENTRIES: SettingEntry[] = [
  { key: 'joystick', title: 'Joystick Settings', image: '/joystick.png' },
  { key: 'drone', title: 'Drone Settings', image: '/drone.png' },
  { key: 'tuning', title: 'PID & Calibration', image: '/gear.png' },
  { key: 'flight', title: 'Flight Records', image: '/folder.png' },
  { key: 'other', title: 'Other Settings', image: '/gear.png' },
]

const fmt = (v: number | null | undefined, digits: number, unit: string): string =>
  v == null ? '--' : `${v.toFixed(digits)}${unit}`

/** 即時影像：串流中斷 (橋接程式重啟、相機換線) 會自動重試。 */
const VideoStream: FC = () => {
  const [ok, setOk] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (ok) return
    const t = window.setTimeout(() => setAttempt(a => a + 1), 3000)
    return () => window.clearTimeout(t)
  }, [ok, attempt])

  return (
    <>
      <img
        key={attempt}
        src={`${API_BASE}/video_feed?n=${attempt}`}
        alt="camera"
        style={{ height: '100%', width: '100%', borderRadius: '10px', objectFit: 'cover', display: ok ? 'block' : 'none' }}
        onLoad={() => setOk(true)}
        onError={() => setOk(false)}
      />
      {!ok && <div className='stream-fallback'>NO VIDEO</div>}
    </>
  )
}

const Dashboard: FC = () => {
  const [sideUpBarOpen, setSideUpBarOpen] = useState(false)
  const [showSetting, setShowSetting] = useState(false)
  const [settingPage, setSettingPage] = useState('')
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('theme') as 'dark' | 'light') || 'dark')

  const live = useGamepadControl()
  const bridge = useBridge()
  const wp = useWaypoints()
  const warnings = useWarnings(bridge.telemetry, bridge.stale, bridge.control.armed)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const { telemetry, stale, trail, home, setHomeHere } = bridge
  const mapProps = useMemo(
    () => ({ telemetry, stale, trail, home, waypoints: wp.waypoints, onSetHome: setHomeHere }),
    [telemetry, stale, trail, home, wp.waypoints, setHomeHere],
  )

  const renderSettingContent = (): ReactNode => {
    switch (settingPage) {
      case 'joystick': return <JoystickSetting />
      case 'drone': return <DroneSetting />
      case 'tuning': return <TuningSetting />
      case 'flight': return <FlightRecords />
      case 'other': return <OtherSetting theme={theme} setTheme={setTheme} />
      default:
        return (
          <div className='setting-entries'>
            {SETTING_ENTRIES.map(entry => (
              <Setting_entry key={entry.key} title={entry.title} image={entry.image} onClick={() => setSettingPage(entry.key)} />
            ))}
          </div>
        )
    }
  }

  const heading = telemetry?.heading
  return (
    <div id='app-wrapper' style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div id='digital_display'>
        <div id='stream' className='digital_item'>
          <VideoStream />
          <Hud
            bridgeConnected={bridge.connected}
            control={bridge.control}
            gpsStale={stale}
            hasFix={telemetry != null}
            padConnected={live.padConnected}
            alerts={bridge.alerts}
            warnings={warnings}
          />
        </div>
        <div id='map' className='digital_item'>
          {!sideUpBarOpen && <MapComponent {...mapProps} />}
        </div>
      </div>
      <div id='other_display'>
        <OtherDataItem title='COURSE' return_data={heading != null ? `${heading.toFixed(0)}°` : '--'} />
        <OtherDataItem title='HEIGHT' return_data={fmt(telemetry?.alt, 1, ' m')} />
        <OtherDataItem title='SPEED' return_data={fmt(telemetry?.speed, 1, ' m/s')} />
        <OtherDataItem title='HOME' return_data={formatDistance(telemetry?.distance_home)} />
        <OtherDataItem title='BATTERY' return_data={fmt(telemetry?.battery, 1, ' V')} />
        <OtherDataItem title='ROLL' return_data={String(live.roll)} />
        <OtherDataItem title='PITCH' return_data={String(live.pitch)} />
        <OtherDataItem title='THROTTLE' return_data={String(live.throttle)} />
      </div>
      <SideUpBar
        open={sideUpBarOpen}
        setOpen={setSideUpBarOpen}
        mapProps={mapProps}
        onAddWaypoint={wp.add}
        onRemoveWaypoint={wp.remove}
        onClearWaypoints={wp.clear}
      />
      <SettingBtn onClick={() => { setShowSetting(true); setSettingPage('') }} />
      {showSetting && (
        <div className='setting-overlay'>
          <div className='setting-modal'>
            <div className='modal-header'>
              <h2>{settingPage === '' ? 'Settings' : SETTING_ENTRIES.find(e => e.key === settingPage)?.title || 'Settings'}</h2>
              {settingPage === ''
                ? <button className='close-btn' onClick={() => setShowSetting(false)}><img src='/close.png' alt='關閉' className='close_btn_pic' /></button>
                : <button className='close-btn' onClick={() => setSettingPage('')}><img src='/close.png' alt='返回' className='close_btn_pic' /></button>}
            </div>
            {renderSettingContent()}
          </div>
        </div>
      )}
    </div>
  )
}

/** 先從後端載入設定 (單一來源)，再渲染主畫面；後端沒開時最多等 2 秒，改用本機快取。 */
const App: FC = () => {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let alive = true
    const timeout = new Promise<null>(r => window.setTimeout(() => r(null), 2000))
    Promise.race([loadSettings(), timeout]).finally(() => { if (alive) setReady(true) })
    return () => { alive = false }
  }, [])
  return ready ? <Dashboard /> : <div className='boot'>Connecting to bridge…</div>
}

export default App
