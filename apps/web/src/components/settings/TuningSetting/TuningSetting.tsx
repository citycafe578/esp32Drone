import './TuningSetting.css'
import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import { api } from '../../../api'

const AXES = [
  { key: 'roll', label: 'Roll' },
  { key: 'pitch', label: 'Pitch' },
  { key: 'yaw', label: 'Yaw' },
  { key: 'rate_roll', label: 'Rate Roll' },
  { key: 'rate_pitch', label: 'Rate Pitch' },
]
const PARAMS = ['p', 'i', 'd'] as const

type Row = Record<(typeof PARAMS)[number], string>
type Msg = { ok: boolean; text: string } | null

const errText = (e: unknown) => (e instanceof Error ? e.message.replace(/^\/[^:]*: /, '') : String(e))

/** PID 調參與 MPU 校正：經由地面站轉給飛機 (USB Serial 與 Wi‑Fi 都可以)。 */
const TuningSetting: FC = () => {
  const [rows, setRows] = useState<Record<string, Row>>({})
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [armed, setArmed] = useState(false)
  const [droneAge, setDroneAge] = useState<number | null>(null)
  const [calibrating, setCalibrating] = useState(false)
  const [calibrated, setCalibrated] = useState<boolean | null>(null)

  const load = useCallback(() => {
    api.tuning()
      .then(r => {
        setRows(Object.fromEntries(Object.entries(r.pid).map(([k, v]) => [k, { p: String(v.p), i: String(v.i), d: String(v.d) }])))
        setMsg(null)
      })
      .catch(e => setMsg({ ok: false, text: errText(e) }))
  }, [])

  useEffect(load, [load])

  useEffect(() => {
    const poll = () => api.link().then(l => {
      setArmed(l.armed)
      setDroneAge(l.link.drone_rx_age_ms ?? null)
      setCalibrating(!!l.link.drone_calibrating)
      setCalibrated(l.link.mpu_calibrated ?? null)
    }).catch(() => undefined)
    poll()
    const t = window.setInterval(poll, 1000)
    return () => window.clearInterval(t)
  }, [])

  const edit = (axis: string, param: (typeof PARAMS)[number], value: string) =>
    setRows(r => ({ ...r, [axis]: { ...(r[axis] ?? { p: '', i: '', d: '' }), [param]: value } }))

  const apply = async (axis: string, label: string) => {
    const row = rows[axis]
    const values = PARAMS.map(p => Number(row?.[p]))
    if (!row || values.some(v => !Number.isFinite(v))) return setMsg({ ok: false, text: `${label}：請輸入有效的數字` })
    setBusy(axis)
    try {
      for (const [idx, p] of PARAMS.entries()) await api.setPid(axis, p, values[idx])
      setMsg({ ok: true, text: `${label} 已送出。地面站已儲存並轉給飛機；按「重新讀取」可以看飛機實際收到的值` })
    } catch (e) {
      setMsg({ ok: false, text: errText(e) })
    } finally {
      setBusy(null)
    }
  }

  const mpu = async (action: 'calibrate' | 'clear') => {
    if (action === 'calibrate' && !window.confirm('校正 MPU 需要飛機水平靜置在地上。確定開始？')) return
    setBusy(action)
    try {
      await api.mpu(action)
      setMsg({ ok: true, text: action === 'calibrate' ? '已送出校正指令 (約需 2 秒)' : '已清除校正資料' })
    } catch (e) {
      setMsg({ ok: false, text: errText(e) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className='tune-root'>
      <table className='tune-table'>
        <thead>
          <tr><th>Axis</th><th>P</th><th>I</th><th>D</th><th /></tr>
        </thead>
        <tbody>
          {AXES.map(a => (
            <tr key={a.key}>
              <td>{a.label}</td>
              {PARAMS.map(p => (
                <td key={p}>
                  <input
                    type='number'
                    step='any'
                    inputMode='decimal'
                    value={rows[a.key]?.[p] ?? ''}
                    onChange={e => edit(a.key, p, e.target.value)}
                  />
                </td>
              ))}
              <td><button disabled={busy !== null || !rows[a.key]} onClick={() => apply(a.key, a.label)}>{busy === a.key ? '…' : '套用'}</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className='tune-actions'>
        <button onClick={load} disabled={busy !== null}>重新讀取</button>
        <button onClick={() => mpu('calibrate')} disabled={busy !== null || armed || calibrating}>MPU 校正</button>
        <button onClick={() => mpu('clear')} disabled={busy !== null || armed || calibrating}>清除校正</button>
        {armed && <span className='tune-note'>已解鎖，無法校正</span>}
        <span className='tune-note'>
          {droneAge === null || droneAge > 1500
            ? '飛機未回報'
            : calibrating ? 'MPU：校正中，請保持飛機靜止…' : calibrated ? 'MPU：已校正' : 'MPU：尚未校正'}
        </span>
      </div>

      {msg && <p className={`tune-msg ${msg.ok ? 'ok' : 'bad'}`}>{msg.text}</p>}
    </div>
  )
}

export default TuningSetting
