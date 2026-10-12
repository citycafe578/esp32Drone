import './FlightRecords.css'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import { api } from '../../../api'
import { formatDistance, formatDuration } from '../../../lib/geo'
import type { FlightDetail, FlightSummary } from '../../../types'

/** 把經緯度軌跡投影成 SVG 折線 (等距圓柱投影，夠用於小範圍)。 */
const Track: FC<{ flight: FlightDetail }> = ({ flight }) => {
  const d = useMemo(() => {
    const pts = flight.points
    const lat0 = pts[0].lat
    const kx = Math.cos((lat0 * Math.PI) / 180)
    const xy = pts.map(p => [p.lng * kx, -p.lat] as const)
    const xs = xy.map(p => p[0]), ys = xy.map(p => p[1])
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
    const span = Math.max(maxX - minX, maxY - minY) || 1e-6
    const s = 180 / span
    return xy.map(([x, y], i) => `${i ? 'L' : 'M'}${((x - minX) * s + 10).toFixed(1)},${((y - minY) * s + 10).toFixed(1)}`).join(' ')
  }, [flight])
  return (
    <svg viewBox="0 0 200 200" className="fr-track">
      <path d={d} fill="none" stroke="#3ea6ff" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

const FlightRecords: FC = () => {
  const [flights, setFlights] = useState<FlightSummary[]>([])
  const [selected, setSelected] = useState<FlightDetail | null>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(() => {
    api.flights().then(r => { setFlights(r.flights); setError('') }).catch(e => setError(String(e.message ?? e)))
  }, [])
  useEffect(refresh, [refresh])

  const open = (id: string) => api.flight(id).then(setSelected).catch(e => setError(String(e.message ?? e)))

  const remove = async (id: string) => {
    if (!window.confirm('刪除這筆飛行紀錄？')) return
    await api.deleteFlight(id).catch(e => setError(String(e.message ?? e)))
    if (selected?.id === id) setSelected(null)
    refresh()
  }

  const download = (f: FlightDetail) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(f, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${f.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fr-root">
      <div className="fr-list">
        {error && <p className="fr-error">{error}</p>}
        {!error && flights.length === 0 && <p className="fr-empty">還沒有飛行紀錄。收到 GPS 資料後會自動錄製，10 秒沒有資料就會存檔。</p>}
        {flights.map(f => (
          <button key={f.id} className={`fr-item ${selected?.id === f.id ? 'active' : ''}`} onClick={() => open(f.id)}>
            <b>{new Date(f.start * 1000).toLocaleString()}</b>
            <span>{formatDuration(f.duration_s)} · {formatDistance(f.distance_m)} · 最高 {f.max_alt_m != null ? `${f.max_alt_m.toFixed(1)} m` : '--'}</span>
          </button>
        ))}
      </div>
      <div className="fr-detail">
        {selected ? (
          <>
            <Track flight={selected} />
            <ul>
              <li>時間：{new Date(selected.start * 1000).toLocaleString()}</li>
              <li>飛行時間：{formatDuration(selected.duration_s)}</li>
              <li>總距離：{formatDistance(selected.distance_m)}</li>
              <li>最遠離起飛點：{formatDistance(selected.max_dist_home_m)}</li>
              <li>最高高度：{selected.max_alt_m != null ? `${selected.max_alt_m.toFixed(1)} m` : '--'}</li>
              <li>取樣點數：{selected.points.length}</li>
            </ul>
            <div className="fr-actions">
              <button onClick={() => download(selected)}>下載 JSON</button>
              <button onClick={() => remove(selected.id)}>刪除</button>
            </div>
          </>
        ) : <p className="fr-empty">選擇左邊的紀錄查看軌跡</p>}
      </div>
    </div>
  )
}

export default FlightRecords
