import { useEffect, useRef, useState } from 'react'
import { useSetting } from './useSetting'
import type { Telemetry } from '../types'

const sounds = import.meta.glob('../sounds/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

function playWarning(n: number, volume: number): void {
  const url = sounds[`../sounds/${n}.mp3`]
  if (!url) return
  const audio = new Audio(url)
  audio.volume = Math.min(1, Math.max(0, volume))
  audio.play().catch(() => undefined) // 瀏覽器尚未有使用者互動時會被擋，忽略
}

const cm = (v: string | undefined): number | null => {
  if (!v || v.toUpperCase() === 'OFF') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * 依「無人機設定」產生即時警告：低空 / 最低巡航高度 / 最高高度 / 地理圍欄 / GPS 訊號中斷。
 * 高度設定單位是公分，遙測高度單位是公尺。
 */
export function useWarnings(telemetry: Telemetry | null, stale: boolean, armed: boolean): string[] {
  const drone = useSetting<Record<string, string>>('droneSettings', {})
  const other = useSetting<Record<string, string>>('otherSettings', {})
  const [warnings, setWarnings] = useState<string[]>([])
  const reachedMin = useRef(false)
  const reachedWarn = useRef(false)
  const lastSound = useRef(0)

  useEffect(() => {
    if (!armed) { reachedMin.current = false; reachedWarn.current = false }
    const out: string[] = []
    const altCm = telemetry?.alt != null ? telemetry.alt * 100 : null

    if (armed && stale && telemetry) out.push('GPS 訊號中斷')

    if (altCm != null && !stale) {
      const lowWarn = cm(drone.lowAltitudeWarning)
      const minCruise = cm(drone.minimumCruisingAltitude)
      const maxCruise = cm(drone.maximumCruisingAltitude)

      // 起飛過程本來就在低空：先到過門檻之後再掉下來才算警告
      if (lowWarn != null) {
        if (altCm >= lowWarn) reachedWarn.current = true
        else if (armed && reachedWarn.current) {
          out.push(`低空警告：高度 ${altCm.toFixed(0)} cm < ${lowWarn} cm`)
          if (Date.now() - lastSound.current > 5000) {
            lastSound.current = Date.now()
            const n = parseInt(String(other.LAWSE ?? '').replace(/\D/g, ''), 10) || 1
            const vol = Number(other.sfxVolume ?? 100)
            playWarning(n, (Number.isFinite(vol) ? vol : 100) / 100)
          }
        }
      }
      if (minCruise != null) {
        if (altCm >= minCruise) reachedMin.current = true
        else if (armed && reachedMin.current) out.push(`低於最低巡航高度 ${minCruise} cm`)
      }
      if (maxCruise != null && altCm > maxCruise) out.push(`超過最高巡航高度 ${maxCruise} cm`)
    }

    const fence = cm(drone.geoFenceRadius)
    if (fence != null && telemetry?.distance_home != null && !stale && telemetry.distance_home > fence) {
      out.push(`超出地理圍欄：距離起飛點 ${telemetry.distance_home.toFixed(0)} m > ${fence} m`)
    }

    setWarnings(prev => (prev.join('|') === out.join('|') ? prev : out))
  }, [telemetry, stale, armed, drone, other])

  return warnings
}
