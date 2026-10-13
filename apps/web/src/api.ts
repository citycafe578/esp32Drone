import { API_BASE } from './config'
import type { AllSettings, FlightDetail, FlightSummary, LatLng, LinkStatus, Telemetry } from './types'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + path, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
  })
  if (!res.ok) {
    let msg = res.statusText
    try { msg = ((await res.json()) as { error?: string }).error ?? msg } catch { /* ignore */ }
    throw new Error(`${path}: ${msg}`)
  }
  return res.json() as Promise<T>
}

const post = <T>(path: string, body?: unknown) =>
  req<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })

export interface LinkInfo { armed: boolean; link: LinkStatus }

export const api = {
  settings: () => req<AllSettings>('/settings'),
  saveSection: (section: string, value: unknown) => post<{ status: string }>(`/settings/${section}`, value),

  listCameras: (refresh = false) => req<{ cameras: number[] }>(`/list_cameras${refresh ? '?refresh=1' : ''}`),
  setCamera: (idx: string) => post('/set_camera', { imageTransmission: idx }),

  ports: () => req<{ ports: { device: string; name: string }[] }>('/get_ports'),
  setPort: (port: string) => post('/set_port', { port }),
  link: () => req<LinkInfo>('/link'),
  setLink: (patch: { linkMode?: string; groundHost?: string; reciver?: string }) => post<LinkInfo>('/link', patch),

  telemetry: () => req<{ latest: Telemetry | null; home: LatLng | null; sim: boolean; trail: [number, number][] }>('/telemetry'),
  setHome: (p?: LatLng) => post<LatLng>('/home', p),
  clearTrail: () => post('/trail/clear'),
  clearMap: () => post('/map/clear'),
  sim: (enabled: boolean) => post<{ sim: boolean }>('/sim', { enabled }),

  tuning: () => req<{ pid: Record<string, { p: number; i: number; d: number }> }>('/tuning'),
  setPid: (axis: string, param: string, value: number) => post('/tuning/pid', { axis, param, value }),
  mpu: (action: 'calibrate' | 'clear') => post(`/tuning/mpu/${action}`),

  waypoints: () => req<{ waypoints: LatLng[] }>('/waypoints'),
  saveWaypoints: (waypoints: LatLng[]) => post('/waypoints', waypoints),

  flights: () => req<{ flights: FlightSummary[] }>('/flights'),
  flight: (id: string) => req<FlightDetail>(`/flights/${id}`),
  deleteFlight: (id: string) => req(`/flights/${id}`, { method: 'DELETE' }),
}
