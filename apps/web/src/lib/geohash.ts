/** Geohash 解碼 (與 python/geohash.py 相同演算法)。後端通常已解碼，這裡作為備援。 */
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'

export function isValidGeohash(gh: string): boolean {
  return gh.length >= 1 && gh.length <= 12 && [...gh.toLowerCase()].every(c => BASE32.includes(c))
}

export function decodeGeohash(gh: string): { lat: number; lng: number; latErr: number; lngErr: number } | null {
  if (!isValidGeohash(gh)) return null
  let latLo = -90, latHi = 90, lngLo = -180, lngHi = 180
  let even = true
  for (const ch of gh.toLowerCase()) {
    const cd = BASE32.indexOf(ch)
    for (const mask of [16, 8, 4, 2, 1]) {
      if (even) {
        const mid = (lngLo + lngHi) / 2
        if (cd & mask) lngLo = mid
        else lngHi = mid
      } else {
        const mid = (latLo + latHi) / 2
        if (cd & mask) latLo = mid
        else latHi = mid
      }
      even = !even
    }
  }
  return {
    lat: (latLo + latHi) / 2,
    lng: (lngLo + lngHi) / 2,
    latErr: (latHi - latLo) / 2,
    lngErr: (lngHi - lngLo) / 2,
  }
}
