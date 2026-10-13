export interface LatLng {
  lat: number
  lng: number
}

/** 後端解碼 Geohash 之後推送的遙測資料。單位：alt=m、speed=m/s、battery=V、heading=度(0=北,順時針)。 */
export interface Telemetry {
  ts: number
  geohash: string
  lat: number
  lng: number
  accuracy_m: number | null
  heading: number | null
  heading_source: 'sensor' | 'gps' | null
  alt: number | null
  speed: number | null
  battery: number | null
  sats: number | null
  home: LatLng | null
  distance_home: number | null
}

export interface LinkStatus {
  mode: string
  connected: boolean
  detail: string
  ground_armed?: boolean
  drone_rx_age_ms?: number | null
  drone_armed?: boolean | null
  roll?: number
  pitch?: number
  battery?: number
  drone_calibrating?: boolean
  mpu_calibrated?: boolean | null
}

export interface ControlState {
  armed: boolean
  link: LinkStatus
}

export type AlertLevel = 'info' | 'warning' | 'error'

export interface AlertMsg {
  id: number
  level: AlertLevel
  message: string
  ts: number
}

export interface FlightSummary {
  id: string
  start: number
  duration_s: number
  distance_m: number
  max_alt_m: number | null
  max_dist_home_m: number
}

export interface FlightPoint {
  t: number
  lat: number
  lng: number
  alt: number | null
  heading: number | null
  speed: number | null
}

export interface FlightDetail extends FlightSummary {
  points: FlightPoint[]
}

export interface AllSettings {
  joystickIndex: number
  axisMapping: Record<string, number | null>
  btnMapping: Record<string, number | null>
  otherSettings: Record<string, string>
  droneSettings: Record<string, string>
  waypoints: LatLng[]
}
