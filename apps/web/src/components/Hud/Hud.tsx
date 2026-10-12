import './Hud.css'
import type { FC } from 'react'
import type { AlertMsg, ControlState } from '../../types'

interface HudProps {
  bridgeConnected: boolean
  control: ControlState
  gpsStale: boolean
  hasFix: boolean
  padConnected: boolean
  alerts: AlertMsg[]
  warnings: string[]
}

const Chip: FC<{ ok: boolean | null; label: string; title?: string }> = ({ ok, label, title }) => (
  <span className={`hud-chip ${ok === null ? 'neutral' : ok ? 'ok' : 'bad'}`} title={title}>{label}</span>
)

const Hud: FC<HudProps> = ({ bridgeConnected, control, gpsStale, hasFix, padConnected, alerts, warnings }) => (
  <div className="hud">
    <div className="hud-chips">
      <Chip ok={bridgeConnected} label={bridgeConnected ? 'BRIDGE' : 'BRIDGE OFFLINE'} title="Python 橋接程式" />
      <Chip ok={control.link.connected} label={control.link.mode === 'serial' ? 'SERIAL' : 'GROUND'} title={control.link.detail} />
      {control.link.mode === 'serial' && control.link.connected && (
        <Chip
          ok={control.link.drone_rx_age_ms != null && control.link.drone_rx_age_ms < 1500}
          label="DRONE"
          title="飛機 ESP-NOW 回傳狀態"
        />
      )}
      <Chip ok={padConnected} label="PAD" title="搖桿" />
      <Chip ok={hasFix ? !gpsStale : false} label={!hasFix ? 'NO GPS' : gpsStale ? 'GPS LOST' : 'GPS'} />
      <Chip ok={control.armed ? false : null} label={control.armed ? 'ARMED' : 'LOCKED'} />
    </div>
    <div className="hud-toasts">
      {warnings.map(w => <div key={w} className="hud-toast warning">⚠ {w}</div>)}
      {alerts.map(a => <div key={a.id} className={`hud-toast ${a.level}`}>{a.message}</div>)}
    </div>
  </div>
)

export default Hud
