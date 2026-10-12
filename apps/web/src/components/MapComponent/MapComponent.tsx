import 'leaflet/dist/leaflet.css'
import './MapComponent.css'
import L from 'leaflet'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FC, PointerEvent as ReactPointerEvent } from 'react'
import { Circle, MapContainer, Marker, Polyline, TileLayer } from 'react-leaflet'
import { shortestDelta } from '../../lib/geo'
import type { LatLng, Telemetry } from '../../types'

const DEFAULT_CENTER: [number, number] = [25.033, 121.5654]
const FIRST_FIX_ZOOM = 18
const DRAG_THRESHOLD_PX = 4

export interface MapProps {
  telemetry: Telemetry | null
  stale: boolean
  trail: LatLng[]
  home: LatLng | null
  waypoints: LatLng[]
  /** 有給才允許點地圖新增航點 */
  onAddWaypoint?: (p: LatLng) => void
  onSetHome?: () => void
  defaultFollow?: boolean
  defaultRotate?: boolean
}

function droneIcon(heading: number | null, stale: boolean): L.DivIcon {
  const body = heading == null
    ? '<circle cx="20" cy="20" r="8"/>'
    : '<path d="M20 3 L32 33 L20 27 L8 33 Z"/>'
  return L.divIcon({
    className: '',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    // 箭頭固定旋轉「航向」角度；地圖本身另外旋轉 -航向，所以航向向上模式下箭頭永遠朝上。
    html: `<div class="drone-marker${stale ? ' stale' : ''}" style="transform:rotate(${heading ?? 0}deg)">` +
      `<svg viewBox="0 0 40 40">${body}</svg></div>`,
  })
}

const labelIcon = (text: string, cls: string) => L.divIcon({
  className: '',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  // counter 會抵銷地圖的旋轉，讓文字維持正向
  html: `<div class="map-pin counter ${cls}">${text}</div>`,
})

const homeIcon = labelIcon('H', 'home')

/** 讀出旋轉層目前實際的旋轉矩陣 (含 CSS transition 進行中的值)。 */
function rotorInverse(rotor: HTMLElement | null): DOMMatrix {
  const t = rotor ? getComputedStyle(rotor).transform : 'none'
  const m = t && t !== 'none' ? new DOMMatrix(t) : new DOMMatrix()
  const inv = m.inverse()
  inv.e = 0
  inv.f = 0
  return inv
}

const MapComponent: FC<MapProps> = ({
  telemetry, stale, trail, home, waypoints,
  onAddWaypoint, onSetHome, defaultFollow = true, defaultRotate = true,
}) => {
  const outerRef = useRef<HTMLDivElement>(null)
  const rotorRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<L.Map | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [follow, setFollow] = useState(defaultFollow)
  const [rotate, setRotate] = useState(defaultRotate)
  const [angle, setAngle] = useState(0) // 連續角度 (不做 mod 360)，避免 359° -> 1° 時反向轉一整圈
  const gotFirstFix = useRef(false)
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)

  const heading = telemetry?.heading ?? null
  const lat = telemetry?.lat
  const lng = telemetry?.lng

  // ── 容器尺寸 ────────────────────────────────────────────────────
  useEffect(() => {
    const el = outerRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── 地圖隨航向旋轉 ──────────────────────────────────────────────
  useEffect(() => {
    if (!rotate) setAngle(a => a + shortestDelta(a, 0))
    else if (heading != null) setAngle(a => a + shortestDelta(a, heading))
  }, [heading, rotate])

  const norm = ((angle % 360) + 360) % 360
  const big = rotate || (norm > 0.01 && norm < 359.99)
  const diag = Math.ceil(Math.hypot(size.w, size.h))
  const rw = big ? diag : size.w
  const rh = big ? diag : size.h

  useEffect(() => { map?.invalidateSize({ animate: false }) }, [map, rw, rh])

  // ── 位置置中 ────────────────────────────────────────────────────
  useEffect(() => {
    if (!map || lat == null || lng == null) return
    if (!gotFirstFix.current) {
      gotFirstFix.current = true
      map.setView([lat, lng], Math.max(map.getZoom(), FIRST_FIX_ZOOM), { animate: false })
      return
    }
    if (follow) map.setView([lat, lng], map.getZoom(), { animate: false })
  }, [map, follow, lat, lng, rw, rh])

  // ── 手勢：自訂拖曳 / 點擊 (Leaflet 內建的在旋轉後座標會錯) ─────────────────
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.map-ctrl')) return
    drag.current = { x: e.clientX, y: e.clientY, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || !map) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
    if (!d.moved) { d.moved = true; setFollow(false) }
    const v = rotorInverse(rotorRef.current).transformPoint(new DOMPoint(dx, dy))
    map.panBy([-v.x, -v.y], { animate: false })
    d.x = e.clientX
    d.y = e.clientY
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    if (!d || d.moved || !map || !onAddWaypoint || !outerRef.current) return
    if ((e.target as HTMLElement).closest('.map-ctrl')) return
    // 螢幕座標 -> 旋轉層座標 -> 經緯度
    const r = outerRef.current.getBoundingClientRect()
    const v = rotorInverse(rotorRef.current).transformPoint(
      new DOMPoint(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)),
    )
    const ll = map.containerPointToLatLng(L.point(rw / 2 + v.x, rh / 2 + v.y))
    onAddWaypoint({ lat: ll.lat, lng: ll.lng })
  }

  const recenter = useCallback(() => {
    setFollow(true)
    if (map && lat != null && lng != null) map.setView([lat, lng], map.getZoom(), { animate: false })
  }, [map, lat, lng])

  // ── 圖層資料 ────────────────────────────────────────────────────
  const trailPts = useMemo(() => trail.map(p => [p.lat, p.lng] as [number, number]), [trail])
  const wpPts = useMemo(() => waypoints.map(p => [p.lat, p.lng] as [number, number]), [waypoints])
  const icon = useMemo(() => droneIcon(heading, stale), [heading, stale])

  return (
    <div
      ref={outerRef}
      className={`map-outer${onAddWaypoint ? ' editable' : ''}`}
      style={{ '--map-angle': angle } as CSSProperties}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { drag.current = null }}
    >
      <div
        ref={rotorRef}
        className="map-rotor"
        style={{
          width: rw,
          height: rh,
          left: (size.w - rw) / 2,
          top: (size.h - rh) / 2,
          transform: `rotate(${-angle}deg)`,
        }}
      >
        <MapContainer
          ref={setMap}
          center={lat != null && lng != null ? [lat, lng] : DEFAULT_CENTER}
          zoom={lat != null ? FIRST_FIX_ZOOM : 15}
          minZoom={3}
          maxZoom={19}
          zoomControl={false}
          attributionControl={false}
          dragging={false}
          scrollWheelZoom="center"
          touchZoom="center"
          doubleClickZoom={false}
          boxZoom={false}
          keyboard={false}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
          {trailPts.length > 1 && <Polyline positions={trailPts} pathOptions={{ color: '#3ea6ff', weight: 3, opacity: 0.85 }} />}
          {wpPts.length > 1 && <Polyline positions={wpPts} pathOptions={{ color: '#ffb020', weight: 2, dashArray: '6 6' }} />}
          {home && <Marker position={[home.lat, home.lng]} icon={homeIcon} interactive={false} />}
          {waypoints.map((p, i) => (
            <Marker key={`${i}-${p.lat}-${p.lng}`} position={[p.lat, p.lng]} icon={labelIcon(String(i + 1), 'wp')} interactive={false} />
          ))}
          {telemetry && telemetry.accuracy_m != null && telemetry.accuracy_m > 1 && (
            <Circle
              center={[telemetry.lat, telemetry.lng]}
              radius={telemetry.accuracy_m}
              pathOptions={{ color: '#3ea6ff', weight: 1, fillOpacity: 0.08 }}
              interactive={false}
            />
          )}
          {telemetry && <Marker position={[telemetry.lat, telemetry.lng]} icon={icon} interactive={false} zIndexOffset={1000} />}
        </MapContainer>
      </div>

      <div className="map-compass" aria-label="north">
        <span>N</span>
      </div>

      <div className="map-ctrl map-buttons">
        <button title="Zoom in" onClick={() => map?.zoomIn()}>+</button>
        <button title="Zoom out" onClick={() => map?.zoomOut()}>−</button>
        <button title="Center on drone" className={follow ? 'on' : ''} onClick={recenter}>◎</button>
        <button title={rotate ? 'Heading up (click for north up)' : 'North up (click for heading up)'} className={rotate ? 'on' : ''} onClick={() => setRotate(r => !r)}>
          {rotate ? 'HDG' : 'N'}
        </button>
        {onSetHome && <button title="Set home here" onClick={onSetHome}>H</button>}
      </div>

      <div className="map-status">
        {telemetry
          ? <>
              {telemetry.lat.toFixed(6)}, {telemetry.lng.toFixed(6)}
              {telemetry.accuracy_m != null && <> · ±{telemetry.accuracy_m.toFixed(1)} m</>}
              {stale && <b> · STALE</b>}
            </>
          : 'Waiting for GPS (geohash)…'}
      </div>
      <div className="map-attrib">© OpenStreetMap</div>
    </div>
  )
}

export default memo(MapComponent)
