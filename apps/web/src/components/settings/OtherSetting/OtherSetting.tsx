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
  LAWSE: string
  sfxVolume: string
  sharpen: string
  grayscale: string
  linkMode: string
  groundHost: string
  deadzone: string
}

const DEFAULTS: OtherSettings = {
  imageTransmission: '0',
  reciver: '',
  LAWSE: 'Sound Effect 1',
  sfxVolume: '100',
  sharpen: '0',
  grayscale: '0',
  linkMode: 'serial',
  groundHost: '192.168.4.1',
  deadzone: '5',
}

interface Port { device: string; name: string }

interface OtherSettingProps {
  /** connection：地面站連線與模擬器；other：影像、音效、搖桿死區、主題 */
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

  // 只有一個可用序列埠，而且目前沒選或選的那個不存在 → 自動選它
  useEffect(() => {
    if (ports.length !== 1) return
    const only = ports[0].device
    if (s.reciver !== only && (s.reciver === '' || !ports.some(p => p.device === s.reciver))) update('reciver', only)
  }, [ports, s.reciver, update])

  const toggleSim = () => api.sim(!sim).then(r => setSim(r.sim)).catch(console.error)

  const age = link?.link.drone_rx_age_ms
  const droneOk = age != null && age < 1500
  const droneText = !link?.link.connected
    ? '— 先連上地面站'
    : age == null
      ? '○ 尚未收到飛機回報'
      : `${droneOk ? '● 連線中' : '○ 回報逾時'} (${age} ms 前)${link?.link.battery ? ` · ${link.link.battery.toFixed(1)} V` : ''}`

  const wrapStyle = { height: '63vh', width: '100%', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '16px' } as const

  const connectionColumn = (
      <div className='column_bar'>
        <div className='settings'>
          <h1>Ground Station Link</h1>
          <select value={s.linkMode} onChange={e => update('linkMode', e.target.value)}>
            <option value='wifi'>Wi-Fi (地面站 AP，需 Wi-Fi 版韌體)</option>
            <option value='serial'>USB Serial (預設，地面站 ESP32)</option>
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
            <h1>Ground Station Port</h1>
            <select value={s.reciver} onChange={e => update('reciver', e.target.value)}>
              <option value=''>Select Port</option>
              {ports.map(p => <option key={p.device} value={p.device}>{p.device} — {p.name}</option>)}
            </select>
          </div>
        )}

        <div className='settings'>
          <h1>Ground Station</h1>
          <span style={{ color: link?.link.connected ? 'var(--ok)' : 'var(--bad)' }}>
            {link ? (link.link.connected ? '● ' : '○ ') + link.link.detail : '○ 橋接程式離線'}
          </span>
        </div>

        <div className='settings'>
          <h1>Drone (ESP-NOW)</h1>
          <span style={{ color: droneOk ? 'var(--ok)' : 'var(--bad)' }}>{droneText}</span>
        </div>

        <div className='settings'>
          <h1>GPS Simulator</h1>
          <button onClick={toggleSim}>{sim ? '■ 停止模擬' : '▶ 啟動模擬'}</button>
          <span>無實機時測試地圖</span>
        </div>

        <div className='settings'>
          <h1>Theme</h1>
          <select value={theme} onChange={e => setTheme(e.target.value as 'dark' | 'light')}>
            <option value='dark'>Dark</option>
            <option value='light'>Light</option>
          </select>
        </div>
      </div>
  )

  return (
    <div style={wrapStyle}>
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
          <h1>Warning Volume</h1>
          <select value={s.sfxVolume} onChange={e => update('sfxVolume', e.target.value)}>
            {['0', '25', '50', '75', '100'].map(p => <option key={p} value={p}>{p}%</option>)}
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

      {connectionColumn}
    </div>
  )
}

export default OtherSetting
