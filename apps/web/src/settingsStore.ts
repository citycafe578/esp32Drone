/**
 * 設定同步：後端 (settings.json) 是唯一來源，localStorage 只是快取。
 *  - 啟動時 loadSettings() 從後端抓下來寫進 localStorage
 *  - saveSetting() 同時更新 localStorage 並 (debounce) 寫回後端
 */
import { api } from './api'
import type { AllSettings } from './types'

export const SETTINGS_EVENT = 'drone-settings-changed'

type Key = 'axisMapping' | 'btnMapping' | 'otherSettings' | 'droneSettings' | 'joystickIndex'
const KEYS: Key[] = ['axisMapping', 'btnMapping', 'otherSettings', 'droneSettings', 'joystickIndex']

export async function loadSettings(): Promise<AllSettings | null> {
  try {
    const s = await api.settings()
    for (const k of KEYS) localStorage.setItem(k, JSON.stringify(s[k]))
    window.dispatchEvent(new Event(SETTINGS_EVENT))
    return s
  } catch (e) {
    console.warn('[settings] 後端無法連線，使用本機快取', e)
    return null
  }
}

export function readSetting<T>(key: Key, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

const timers = new Map<Key, number>()

export function saveSetting(key: Key, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
  window.dispatchEvent(new Event(SETTINGS_EVENT))
  window.clearTimeout(timers.get(key))
  timers.set(key, window.setTimeout(() => {
    api.saveSection(key, value).catch(err => console.warn(`[settings] 儲存 ${key} 失敗`, err))
  }, 250))
}
