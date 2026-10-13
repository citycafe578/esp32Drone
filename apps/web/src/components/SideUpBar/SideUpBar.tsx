import './SideUpBar.css'
import { useState } from 'react'
import type { FC } from 'react'
import FlightRecords from '../settings/FlightRecords/FlightRecords'
import MapComponent from '../MapComponent/MapComponent'
import type { MapProps } from '../MapComponent/MapComponent'
import { formatDistance, haversine } from '../../lib/geo'
import type { LatLng } from '../../types'

interface SideUpBarProps {
  open: boolean
  setOpen: (open: boolean) => void
  mapProps: Omit<MapProps, 'onAddWaypoint' | 'defaultFollow' | 'defaultRotate'>
  onAddWaypoint: (p: LatLng) => void
  onRemoveWaypoint: (index: number) => void
  onClearWaypoints: () => void
}

const SideUpBar: FC<SideUpBarProps> = ({ open, setOpen, mapProps, onAddWaypoint, onRemoveWaypoint, onClearWaypoints }) => {
  const [view, setView] = useState<'autopilot' | 'records'>('autopilot')
  const wps = mapProps.waypoints
  const legs = wps.map((p, i) => (i === 0 ? 0 : haversine(wps[i - 1], p)))
  const total = legs.reduce((a, b) => a + b, 0)

  return (
    <>
      {open && <div className="overlay" onClick={() => setOpen(false)} />}
      <div className={`bottom-sheet ${open ? 'open' : ''}`}>
        <div className="drag-handle" onClick={() => setOpen(!open)}>
          <div className="handle-bar" />
        </div>
        <div className="sheet-content">
          <div className="sheet-title">
            <select value={view} onChange={e => setView(e.target.value as 'autopilot' | 'records')}>
              <option value="autopilot">Autopilot Settings</option>
              <option value="records">Flight Records</option>
            </select>
          </div>
          {view === 'records' ? <FlightRecords /> : (
          <div className="sheet-body">
            <div id="auto_pilot_map">
              {/* 抽屜關閉時不需要渲染第二張地圖 */}
              {open && (
                <MapComponent {...mapProps} onAddWaypoint={onAddWaypoint} defaultFollow={false} defaultRotate={false} />
              )}
            </div>
            <div id="waypoint_setting">
              <div id="waypoints_bar">
                {wps.length === 0 && <p className="wp-empty">點擊地圖新增航點</p>}
                {wps.map((p, i) => (
                  <div className="wp-item" key={`${i}-${p.lat}-${p.lng}`}>
                    <span className="wp-index">{i + 1}</span>
                    <span className="wp-coord">
                      {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                      {i > 0 && <small> +{formatDistance(legs[i])}</small>}
                    </span>
                    <button className="wp-remove btn-icon" title="Remove" onClick={() => onRemoveWaypoint(i)}>×</button>
                  </div>
                ))}
              </div>
              <div className="wp-total">{wps.length} 個航點 · 全長 {formatDistance(total)}</div>
              <button id="save_and_cancel_btns" onClick={onClearWaypoints} disabled={wps.length === 0}>Clear All</button>
            </div>
          </div>
          )}
        </div>
      </div>
    </>
  )
}

export default SideUpBar
