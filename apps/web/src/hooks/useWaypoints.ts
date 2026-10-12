import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { LatLng } from '../types'

/** 航點清單：所有地圖共用同一份，並同步到後端 (settings.json)。 */
export function useWaypoints() {
  const [waypoints, setWaypoints] = useState<LatLng[]>([])
  const loaded = useRef(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    api.waypoints()
      .then(r => setWaypoints(r.waypoints))
      .catch(() => undefined)
      .finally(() => { loaded.current = true })
  }, [])

  useEffect(() => {
    if (!loaded.current) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      api.saveWaypoints(waypoints).catch(err => console.warn('[waypoints] 儲存失敗', err))
    }, 400)
    return () => window.clearTimeout(timer.current)
  }, [waypoints])

  const add = useCallback((p: LatLng) => setWaypoints(w => [...w, p]), [])
  const remove = useCallback((i: number) => setWaypoints(w => w.filter((_, idx) => idx !== i)), [])
  const clear = useCallback(() => setWaypoints([]), [])
  return { waypoints, add, remove, clear }
}
