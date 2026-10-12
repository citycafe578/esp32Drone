import { useEffect, useState } from 'react'
import { socket } from '../socket'
import { readSetting, SETTINGS_EVENT } from '../settingsStore'

export interface ControlFrame {
  throttle: number
  pitch: number
  yaw: number
  roll: number
  emergency_stop: 0 | 1
  start_up: 0 | 1
  speed_mode: 0 | 1
  obstacle_avoidance: 0 | 1
  still_dont_know: 0 | 1
}

export interface LiveControl extends ControlFrame {
  padConnected: boolean
}

const NEUTRAL: ControlFrame = {
  throttle: 1000, pitch: 1500, yaw: 1500, roll: 1500,
  emergency_stop: 0, start_up: 0, speed_mode: 0, obstacle_avoidance: 0, still_dont_know: 0,
}

const SEND_INTERVAL_MS = 50   // 20Hz；後端會再以固定頻率轉送並負責失聯保護
const UI_INTERVAL_MS = 66

interface Mapping {
  axes: Record<string, number | null>
  btns: Record<string, number | null>
  padIndex: number
  deadzone: number
}

function loadMapping(): Mapping {
  const other = readSetting<Record<string, string>>('otherSettings', {})
  const dz = Number(other.deadzone ?? 5)
  return {
    axes: readSetting('axisMapping', {}),
    btns: readSetting('btnMapping', {}),
    padIndex: Number(readSetting('joystickIndex', 0)) || 0,
    deadzone: Math.min(0.4, Math.max(0, (Number.isFinite(dz) ? dz : 5) / 100)),
  }
}

const clamp = (v: number) => Math.max(1000, Math.min(2000, Math.round(v)))

function applyDeadzone(v: number, dz: number): number {
  if (Math.abs(v) < dz) return 0
  return (Math.sign(v) * (Math.abs(v) - dz)) / (1 - dz)
}

export function listPads(): Gamepad[] {
  return navigator.getGamepads ? (Array.from(navigator.getGamepads()).filter(Boolean) as Gamepad[]) : []
}

export function computeFrame(pad: Gamepad | undefined, m: Mapping): ControlFrame {
  if (!pad) return NEUTRAL
  const axis = (key: string): number | null => {
    const idx = m.axes[key]
    return idx == null ? null : (pad.axes[idx] ?? 0)
  }
  const btn = (key: string): 0 | 1 => {
    const idx = m.btns[key]
    return idx != null && (pad.buttons[idx]?.value ?? 0) > 0.5 ? 1 : 0
  }
  const thr = axis('throttle')
  const pit = axis('pitch')
  const yaw = axis('yaw')
  const rol = axis('roll')

  // 沒綁定的油門一律當作最低 (舊版會誤判成 1500 = 半油門)
  let throttle = thr == null ? 1000 : clamp(1500 - thr * 500)
  if (throttle < 1020) throttle = 1000

  return {
    throttle,
    pitch: pit == null ? 1500 : clamp(1500 - applyDeadzone(pit, m.deadzone) * 500),
    yaw: yaw == null ? 1500 : clamp(1500 + applyDeadzone(yaw, m.deadzone) * 500),
    roll: rol == null ? 1500 : clamp(1500 + applyDeadzone(rol, m.deadzone) * 500),
    emergency_stop: btn('emergency stop'),
    start_up: btn('start up'),
    speed_mode: btn('speed mode'),
    obstacle_avoidance: btn('obstacle avoidance'),
    still_dont_know: btn('still dont know'),
  }
}

/**
 * 讀取搖桿 -> 以 20Hz 透過 Socket.IO 送給後端。
 * 搖桿拔除時送出中立值 (油門最低)，不會讓最後一筆指令卡住。
 * 回傳值 (給畫面顯示用) 只以 ~15Hz 更新，避免整個 App 每個影格重繪。
 */
export function useGamepadControl(): LiveControl {
  const [live, setLive] = useState<LiveControl>({ ...NEUTRAL, padConnected: false })

  useEffect(() => {
    let mapping = loadMapping()
    const reload = () => { mapping = loadMapping() }
    window.addEventListener(SETTINGS_EVENT, reload)

    let raf = 0
    let lastSend = 0
    let lastUi = 0
    let lastKey = ''

    const loop = (now: number) => {
      const pad = listPads()[mapping.padIndex]
      const frame = computeFrame(pad, mapping)

      if (now - lastSend >= SEND_INTERVAL_MS) {
        lastSend = now
        if (socket.connected) socket.emit('control_signal', frame)
      }
      if (now - lastUi >= UI_INTERVAL_MS) {
        lastUi = now
        const key = JSON.stringify(frame) + (pad ? '1' : '0')
        if (key !== lastKey) {
          lastKey = key
          setLive({ ...frame, padConnected: !!pad })
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener(SETTINGS_EVENT, reload)
    }
  }, [])

  return live
}
