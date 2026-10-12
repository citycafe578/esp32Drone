import type { LatLng } from '../types'

const R = 6_371_000

export function haversine(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180
  const dp = (b.lat - a.lat) * rad
  const dl = (b.lng - a.lng) * rad
  const h = Math.sin(dp / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dl / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** 把角度差正規化到 (-180, 180]，讓地圖旋轉永遠走最短路徑 (359° -> 1° 只轉 2°)。 */
export function shortestDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180
}

export function formatDistance(m: number | null | undefined): string {
  if (m == null) return '--'
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(0)} m`
}

export function formatDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}
