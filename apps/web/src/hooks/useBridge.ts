import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { socket } from '../socket'
import { decodeGeohash } from '../lib/geohash'
import { haversine } from '../lib/geo'
import type { AlertLevel, AlertMsg, ControlState, LatLng, Telemetry } from '../types'

const STALE_AFTER_MS = 3000
const MAX_TRAIL = 2000

/** 把後端推送的遙測整理好；萬一沒有經緯度但有 Geohash，就在前端解碼。 */
function normalize(p: Telemetry): Telemetry | null {
  if (typeof p.lat === 'number' && typeof p.lng === 'number') return p
  const d = p.geohash ? decodeGeohash(p.geohash) : null
  return d ? { ...p, lat: d.lat, lng: d.lng } : null
}

/**
 * 與後端橋接程式的 Socket.IO 連線：遙測 (GPS)、控制狀態 (ARM / 連線)、警報。
 */
export function useBridge() {
  const [connected, setConnected] = useState(socket.connected)
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null)
  const [trail, setTrail] = useState<LatLng[]>([])
  const [home, setHome] = useState<LatLng | null>(null)
  const [stale, setStale] = useState(true)
  const [control, setControl] = useState<ControlState>({
    armed: false,
    link: { mode: 'none', connected: false, detail: '' },
  })
  const [alerts, setAlerts] = useState<AlertMsg[]>([])
  const lastRx = useRef(0)
  const nextId = useRef(0)

  const pushAlert = useCallback((level: AlertLevel, message: string) => {
    const id = ++nextId.current
    setAlerts(a => [...a.slice(-3), { id, level, message, ts: Date.now() }])
    window.setTimeout(() => setAlerts(a => a.filter(x => x.id !== id)), 6000)
  }, [])

  const clearTrail = useCallback(() => {
    setTrail([])
    api.clearTrail().catch(() => undefined)
  }, [])

  const setHomeHere = useCallback(() => {
    api.setHome().then(h => setHome(h)).catch(() => pushAlert('error', '目前沒有定位資料，無法設定起飛點'))
  }, [pushAlert])

  useEffect(() => {
    const onTelemetry = (raw: Telemetry) => {
      const p = normalize(raw)
      if (!p) return
      lastRx.current = Date.now()
      setStale(false)
      setTelemetry(p)
      if (p.home) setHome(p.home)
      setTrail(prev => {
        const last = prev[prev.length - 1]
        if (last && haversine(last, p) < 0.5) return prev
        const next = [...prev, { lat: p.lat, lng: p.lng }]
        return next.length > MAX_TRAIL ? next.slice(-MAX_TRAIL) : next
      })
    }
    const onControl = (s: ControlState) => setControl(s)
    const onAlert = (a: { level: AlertLevel; message: string }) => pushAlert(a.level, a.message)
    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)

    socket.on('telemetry', onTelemetry)
    socket.on('control_state', onControl)
    socket.on('alert', onAlert)
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.connect()

    // 還原重新整理之前的軌跡 / 起飛點
    api.telemetry().then(r => {
      if (r.home) setHome(r.home)
      setTrail(prev => (prev.length ? prev : r.trail.map(([lat, lng]) => ({ lat, lng }))))
    }).catch(() => undefined)

    const timer = window.setInterval(() => {
      setStale(Date.now() - lastRx.current > STALE_AFTER_MS)
    }, 500)

    return () => {
      window.clearInterval(timer)
      socket.off('telemetry', onTelemetry)
      socket.off('control_state', onControl)
      socket.off('alert', onAlert)
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.disconnect()
    }
  }, [pushAlert])

  return { connected, telemetry, trail, home, stale, control, alerts, pushAlert, clearTrail, setHomeHere }
}
