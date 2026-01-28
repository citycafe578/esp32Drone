import { useEffect, useState, FC } from 'react'
import './JoystickSetting.css'

interface AxisMapping {
  altitude: number | null
  pitch: number | null
  yaw: number | null
  roll: number | null
  [key: string]: number | null
}

interface ButtonMapping {
    'start up': number | null
    'speed mode': number | null
    'downward obstacle avoidance': number | null
    'still dont know': number | null
    'emergency stop': number | null
    [key: string]: number | null
}

interface ControlAxis {
    key: string
    label: string
}

interface ControlBtn {
    key: string
    label: string
}

const JoystickSetting: FC = () => {
    const [gamepads, setGamepads] = useState<Gamepad[]>([])
    const [selectedIndex, setSelectedIndex] = useState<string | number>('')
    const [detecting, setDetecting] = useState<boolean>(false)
    const [maxAxis, setMaxAxis] = useState<number | null>(null)
    const [maxDelta, setMaxDelta] = useState<number | null>(null)

    const controlAxes: ControlAxis[] = [
        { key: 'altitude', label: 'Altitude' },
        { key: 'pitch', label: 'Pitch' },
        { key: 'yaw', label: 'Yaw' },
        { key: 'roll', label: 'Roll' },
    ]

    const controlBtns: ControlBtn[] = [
        { key: 'start up', label: 'Start Up' },
        { key: 'speed mode', label: 'Speed Mode' },
        { key: 'obstacle avoidance', label: 'Obstacle Avoidance' },
        { key: 'still dont know', label: 'Still Dont Know' },
        { key: 'emergency stop', label: 'Emergency Stop' }
    ]

    const getInitAxisMapping = (): AxisMapping => {
        const local = localStorage.getItem('axisMapping')
        if (local) return JSON.parse(local) as AxisMapping
        return {
            altitude: null,
            pitch: null,
            yaw: null,
            roll: null,
        }
    }

    const getInitBtnMapping = (): ButtonMapping => {
        const local = localStorage.getItem('btnMapping')
        if (local) return JSON.parse(local) as ButtonMapping
        return {
            'start up': null,
            'speed mode': null,
            'downward obstacle avoidance': null,
            'still dont know': null,
            'emergency stop': null
        }
    }

    const [axisMapping, setAxisMapping] = useState<AxisMapping>(getInitAxisMapping)
    const [btnMapping, setBtnMapping] = useState<ButtonMapping>(getInitBtnMapping)
    const [detectingKey, setDetectingKey] = useState<string | null>(null)

    const updateGamepads = (): void => {
        const pads = navigator.getGamepads
        ? (Array.from(navigator.getGamepads()).filter(Boolean) as Gamepad[])
        : []
        setGamepads(pads)
    }

    useEffect(() => {
        window.addEventListener('gamepadconnected', updateGamepads)
        window.addEventListener('gamepaddisconnected', updateGamepads)
        updateGamepads()
        return () => {
            window.removeEventListener('gamepadconnected', updateGamepads)
            window.removeEventListener('gamepaddisconnected', updateGamepads)
        }
    }, [])

    useEffect(() => {
        localStorage.setItem('joystickIndex', JSON.stringify(selectedIndex))
    }, [selectedIndex])

    const handleDetectAxis = (ctrlKey: string): void => {
        if (!gamepads[selectedIndex as number]) return
        setDetectingKey(ctrlKey)
        const gamepad = gamepads[selectedIndex as number]
        const axesCount = gamepad.axes.length
        const startValues = [...gamepad.axes]
        let bound = false

        function detectLoop(): void {
            const nowPad = navigator.getGamepads()[gamepad.index]
            if (nowPad && !bound) {
                for (let i = 0; i < axesCount; i++) {
                    if (Math.abs(nowPad.axes[i] - startValues[i]) > 0.2) { // 靈敏度門檻
                        setAxisMapping(prev => {
                            const updated = { ...prev, [ctrlKey]: i }
                            saveSettings(updated, btnMapping)
                            return updated
                        })
                        setDetectingKey(null)
                        bound = true
                        return
                    }
                }
                requestAnimationFrame(detectLoop)
            } else if (!bound) {
                requestAnimationFrame(detectLoop)
            }
        }       
        requestAnimationFrame(detectLoop)
    }

    const handleDetectBtns = (ctrlKey: string): void => {
        if (!gamepads[selectedIndex as number]) return
        setDetectingKey(ctrlKey)
        const gamepad = gamepads[selectedIndex as number]
        const buttonsCount = gamepad.buttons.length
        const startValues = gamepad.buttons.map(btn => btn.value)
        let bound = false

        function detectLoop(): void {
        const nowPad = navigator.getGamepads()[gamepad.index]
        if (nowPad && !bound) {
            for (let i = 0; i < buttonsCount; i++) {
            if (Math.abs(nowPad.buttons[i].value - startValues[i]) > 0.2) { // 靈敏度門檻
                setBtnMapping(prev => {
                const updated = { ...prev, [ctrlKey]: i }
                saveSettings(axisMapping, updated)
                return updated
                })
                setDetectingKey(null)
                bound = true
                return
            }
            }
            requestAnimationFrame(detectLoop)
        } else if (!bound) {
            requestAnimationFrame(detectLoop)
        }
        }
        requestAnimationFrame(detectLoop)
    }

    function saveSettings(newAxis: AxisMapping, newBtn: ButtonMapping): void {
        localStorage.setItem('axisMapping', JSON.stringify(newAxis))
        localStorage.setItem('btnMapping', JSON.stringify(newBtn))
    }

    return (
        <div id='aaaaaaaaaaaa' style={{ width: '100%', height: '100%' }}>
        <div style={{ width: '100%', height: '63vh', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flex: '1' }}>
            {/* 左邊設定 */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: '1', width: '50%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
            <div className="settings" id="joystick-list">
                <h1 style={{ justifyContent: 'left' }}>Joystick List</h1>
                <select
                value={selectedIndex}
                onChange={(e) => setSelectedIndex(e.target.value)}
                style={{ justifyContent: 'right' }}
                >
                <option value="">Joystick:</option>
                {gamepads.map((pad, idx) => (
                    <option key={pad.id} value={idx}>
                    {pad.id}
                    </option>
                ))}
                </select>
            </div>

            {controlAxes.map(ctrl => (
                <div className='settings' key={ctrl.key}>
                <h1 style={{ justifyContent: 'left' }}>{ctrl.label}</h1>
                <button
                    onClick={() => handleDetectAxis(ctrl.key)}
                    disabled={detectingKey !== null || !gamepads[selectedIndex as number]}
                >
                    {detectingKey === ctrl.key ? '偵測中...' : '偵測搖桿軸'}
                </button>
                <span style={{ marginLeft: '12px' }}>
                    {axisMapping[ctrl.key] !== null ? `已綁定搖桿軸：${axisMapping[ctrl.key]}` : '尚未綁定'}
                </span>
                </div>
            ))}
            </div>

            {/* 右邊設定 */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: '1', width: '50%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
            {controlBtns.map(ctrl => (
                <div className='settings' key={ctrl.key}>
                <h1 style={{ justifyContent: 'left' }}>{ctrl.label}</h1>
                <button
                    onClick={() => handleDetectBtns(ctrl.key)}
                    disabled={detectingKey !== null || !gamepads[selectedIndex as number]}
                >
                    {detectingKey === ctrl.key ? '偵測中...' : '偵測按鈕'}
                </button>
                <span style={{ marginLeft: '12px' }}>
                    {btnMapping[ctrl.key] !== null ? `已綁定按鈕：${btnMapping[ctrl.key]}` : '尚未綁定'}
                </span>
                </div>
            ))}
            </div>

        </div>
        </div>
    )
}

export default JoystickSetting
