import { useCallback, useEffect, useState } from 'react'
import type { Dispatch, FC, SetStateAction } from 'react'
import '../JoystickSetting/JoystickSetting.css'
import '../../../App.css'
import { api } from '../../../api'
import type { LinkInfo } from '../../../api'
import { readSetting, saveSetting } from '../../../settingsStore'

interface OtherSettings {
  imageTransmission: string
  reciver: string
  transmissionPower: string
  LAWSE: string
  sharpen: string
  grayscale: string
  linkMode: string
  groundHost: string
  deadzone: string
}

const DEFAULTS: OtherSettings = {
  imageTransmission: '0',
  reciver: '',
  transmissionPower: 'Low',
  LAWSE: 'Sound Effect 1',
  sharpen: '0',
  grayscale: '0',
  linkMode: 'wifi',
  groundHost: '192.168.4.1',
  deadzone: '5',
}

interface Port { device: string; name: string }

interface OtherSettingProps {
  theme: 'dark' | 'light'
  setTheme: Dispatch<SetStateAction<'dark' | 'light'>>
}

const PERCENTS = ['0', '25', '50', '75', '100']

const normalize = (s: Partial<OtherSettings>): OtherSettings => {
  const m = { ...DEFAULTS, ...s }
  // 舊版把音效存成 "1"，統一成 "Sound Effect 1"
  if (/^\d$/.test(m.LAWSE)) m.LAWSE = `Sound Effect ${m.LAWSE}`
  return m
}

const OtherSetting: FC<OtherSettingProps> = ({ theme, setTheme }) => {
  const [s, setS] = useState<OtherSettings>(() => normalize(readSetting<Partial<OtherSettings>>('otherSettings', {})))
  const [cameras, setCameras] = useState<number[]>([])
  const [ports, setPorts] = useState<Port[]>([])
  const [link, setLink] = useState<LinkInfo | null>(null)
  const [sim, setSim] = useState(false)

  const update = useCallback(<K extends keyof OtherSettings>(key: K, value: OtherSettings[K]) => {
    setS(prev => {
      const next = { ...prev, [key]: value }
      saveSetting('otherSettings', next)   // 同步到後端；後端會依新設定重新連線 / 切換相機
      return next
    })
  }, [])

  useEffect(() => {
    api.listCameras().then(r => setCameras(r.cameras)).catch(e => console.error('list_cameras', e))
    api.ports().then(r => setPorts(r.ports)).catch(e => console.error('get_ports', e))
    api.telemetry().then(r => setSim(r.sim)).catch(() => undefined)
  }, [])

  useEffect(() => {
    const poll = () => api.link().then(setLink).catch(() => setLink(null))
    poll()
    const t = window.setInterval(poll, 1500)
    return () => window.clearInterval(t)
  }, [])

  const toggleSim = () => api.sim(!sim).then(r => setSim(r.sim)).catch(console.error)

  return (
    <div style={{ height: '63vh', width: '100%', display: 'flex', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: '16px', paddingTop: '12px', overflowY: 'auto' }}>
      <div className='column_bar'>
        <div className='settings'>
          <h1>Image Transmission</h1>
          <select value={s.imageTransmission} onChange={e => { update('imageTransmission', e.target.value); api.setCamera(e.target.value).catch(console.error) }}>
            {cameras.length === 0 && <option value={s.imageTransmission}>Camera {s.imageTransmission} (未偵測到)</option>}
            {cameras.map(idx => <option key={idx} value={String(idx)}>Camera {idx}</option>)}
          </select>
        </div>

        <div className='settings'>
          <h1>Low Alt Warning SFX</h1>
          <select value={s.LAWSE} onChange={e => update('LAWSE', e.target.value)}>
            {[1, 2, 3, 4, 5].map(n => <option key={n}>{`Sound Effect ${n}`}</option>)}
          </select>
        </div>

        <div className='settings'>
          <h1>Image Sharpen</h1>
          <select value={s.sharpen} onChange={e => update('sharpen', e.target.value)}>
            {PERCENTS.map(p => <option key={p} value={p}>{p}%</option>)}
          </select>
        </div>

        <div className='settings'>
          <h1>Image Grayscale</h1>
          <select value={s.grayscale} onChange={e => update('grayscale', e.target.value)}>
            {PERCENTS.map(p => <option key={p} value={p}>{p}%</option>)}
          </select>
        </div>

        <div className='settings'>
          <h1>Stick Deadzone</h1>
          <select value={s.deadzone} onChange={e => update('deadzone', e.target.value)}>
            {['0', '2', '5', '8', '10', '15'].map(p => <option key={p} value={p}>{p}%</option>)}
          </select>
        </div>
      </div>

      <div className='column_bar'>
        <div className='settings'>
          <h1>Ground Station Link</h1>
          <select value={s.linkMode} onChange={e => update('linkMode', e.target.value)}>
            <option value='wifi'>Wi-Fi (Drone_GCS_Relay)</option>
            <option value='serial'>USB Serial</option>
          </select>
        </div>

        {s.linkMode === 'wifi' ? (
          <div className='settings'>
            <h1>Ground Host</h1>
            <input
              value={s.groundHost}
              onChange={e => setS(p => ({ ...p, groundHost: e.target.value }))}
              onBlur={e => update('groundHost', e.target.value.trim() || DEFAULTS.groundHost)}
              style={{ minWidth: 160 }}
            />
          </div>
        ) : (
          <div className='settings'>
            <h1>Receiver</h1>
            <select value={s.reciver} onChange={e => update('reciver', e.target.value)}>
              <option value=''>Select Port</option>
              {ports.map(p => <option key={p.device} value={p.device}>{p.device} — {p.name}</option>)}
            </select>
          </div>
        )}

        <div className='settings'>
          <h1>Link Status</h1>
          <span style={{ color: link?.link.connected ? '#5be584' : '#ff6b6b' }}>
            {link ? (link.link.connected ? '● ' : '○ ') + link.link.detail : '○ 橋接程式離線'}
          </span>
        </div>

        <div className='settings'>
          <h1>Transmission Power</h1>
          <select value={s.transmissionPower} onChange={e => update('transmissionPower', e.target.value)}>
            <option>Low</option>
            <option>High</option>
          </select>
        </div>

        <div className='settings'>
          <h1>GPS Simulator</h1>
          <button onClick={toggleSim} style={{ minWidth: 120 }}>{sim ? '■ 停止模擬' : '▶ 啟動模擬'}</button>
          <span>無實機時測試地圖</span>
        </div>

        <div className='settings'>
          <h1>Theme</h1>
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} style={{ minWidth: 120 }}>
            {theme === 'dark' ? '🌙 Dark' : '☀️ Light'}
          </button>
          <span>{theme === 'dark' ? '深色模式' : '原始配色'}</span>
        </div>
      </div>
    </div>
  )
}

export default OtherSetting
