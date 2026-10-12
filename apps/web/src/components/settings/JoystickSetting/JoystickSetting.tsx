import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import './JoystickSetting.css'
import { listPads } from '../../../hooks/useGamepadControl'
import { readSetting, saveSetting } from '../../../settingsStore'

type Mapping = Record<string, number | null>

const CONTROL_AXES = [
    { key: 'throttle', label: 'Throttle' },
    { key: 'pitch', label: 'Pitch' },
    { key: 'yaw', label: 'Yaw' },
    { key: 'roll', label: 'Roll' },
]

const CONTROL_BTNS = [
    { key: 'start up', label: 'Start Up' },
    { key: 'speed mode', label: 'Speed Mode' },
    { key: 'obstacle avoidance', label: 'Obstacle Avoidance' },
    { key: 'still dont know', label: 'Still Dont Know' },
    { key: 'emergency stop', label: 'Emergency Stop' },
]

const withDefaults = (keys: { key: string }[], saved: Mapping): Mapping =>
    Object.fromEntries(keys.map(k => [k.key, saved[k.key] ?? null]))

const JoystickSetting: FC = () => {
    const [gamepads, setGamepads] = useState<Gamepad[]>(listPads)
    const [selectedIndex, setSelectedIndex] = useState<number>(() => Number(readSetting('joystickIndex', 0)) || 0)
    const [axisMapping, setAxisMapping] = useState<Mapping>(() => withDefaults(CONTROL_AXES, readSetting('axisMapping', {})))
    const [btnMapping, setBtnMapping] = useState<Mapping>(() => withDefaults(CONTROL_BTNS, readSetting('btnMapping', {})))
    const [detectingKey, setDetectingKey] = useState<string | null>(null)

    const updateGamepads = useCallback(() => setGamepads(listPads()), [])

    useEffect(() => {
        window.addEventListener('gamepadconnected', updateGamepads)
        window.addEventListener('gamepaddisconnected', updateGamepads)
        return () => {
            window.removeEventListener('gamepadconnected', updateGamepads)
            window.removeEventListener('gamepaddisconnected', updateGamepads)
        }
    }, [updateGamepads])

    const selectPad = (idx: number) => {
        setSelectedIndex(idx)
        saveSetting('joystickIndex', idx)
    }

    /** 偵測：等使用者推動 / 按下某個軸或按鈕，綁定變化最大的那一個。 */
    const detect = (ctrlKey: string, kind: 'axis' | 'button') => {
        const pad = gamepads[selectedIndex]
        if (!pad) return
        setDetectingKey(ctrlKey)
        const read = (p: Gamepad) => (kind === 'axis' ? [...p.axes] : p.buttons.map(b => b.value))
        const start = read(pad)
        const threshold = kind === 'axis' ? 0.2 : 0.5
        const startedAt = performance.now()
        let raf = 0

        const loop = () => {
            const now = listPads()[selectedIndex]
            if (!now || performance.now() - startedAt > 10_000) { setDetectingKey(null); return } // 10 秒逾時
            const values = read(now)
            let best = -1
            let bestDelta = threshold
            values.forEach((v, i) => {
                const d = Math.abs(v - (start[i] ?? 0))
                if (d > bestDelta) { best = i; bestDelta = d }
            })
            if (best >= 0) {
                if (kind === 'axis') {
                    setAxisMapping(prev => { const u = { ...prev, [ctrlKey]: best }; saveSetting('axisMapping', u); return u })
                } else {
                    setBtnMapping(prev => { const u = { ...prev, [ctrlKey]: best }; saveSetting('btnMapping', u); return u })
                }
                setDetectingKey(null)
                return
            }
            raf = requestAnimationFrame(loop)
        }
        raf = requestAnimationFrame(loop)
        return () => cancelAnimationFrame(raf)
    }

    const canDetect = detectingKey === null && !!gamepads[selectedIndex]

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <div style={{ width: '100%', height: '63vh', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flex: '1' }}>
                <div style={{ display: 'flex', flexDirection: 'column', flex: '1', width: '50%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="settings" id="joystick-list">
                        <h1 style={{ justifyContent: 'left' }}>Joystick List</h1>
                        <select value={gamepads[selectedIndex] ? selectedIndex : ''} onChange={e => selectPad(Number(e.target.value))}>
                            <option value="" disabled>{gamepads.length ? 'Joystick:' : '請按一下搖桿上的任一按鍵'}</option>
                            {gamepads.map((pad, idx) => <option key={pad.id + idx} value={idx}>{pad.id}</option>)}
                        </select>
                    </div>

                    {CONTROL_AXES.map(ctrl => (
                        <div className="settings" key={ctrl.key}>
                            <h1 style={{ justifyContent: 'left' }}>{ctrl.label}</h1>
                            <button onClick={() => detect(ctrl.key, 'axis')} disabled={!canDetect}>
                                {detectingKey === ctrl.key ? '偵測中... 請推動搖桿' : '偵測搖桿軸'}
                            </button>
                            <span style={{ marginLeft: '12px' }}>
                                {axisMapping[ctrl.key] != null ? `已綁定搖桿軸：${axisMapping[ctrl.key]}` : '尚未綁定'}
                            </span>
                        </div>
                    ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', flex: '1', width: '50%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                    {CONTROL_BTNS.map(ctrl => (
                        <div className="settings" key={ctrl.key}>
                            <h1 style={{ justifyContent: 'left' }}>{ctrl.label}</h1>
                            <button onClick={() => detect(ctrl.key, 'button')} disabled={!canDetect}>
                                {detectingKey === ctrl.key ? '偵測中... 請按按鈕' : '偵測按鈕'}
                            </button>
                            <span style={{ marginLeft: '12px' }}>
                                {btnMapping[ctrl.key] != null ? `已綁定按鈕：${btnMapping[ctrl.key]}` : '尚未綁定'}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default JoystickSetting
