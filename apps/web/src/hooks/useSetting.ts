import { useEffect, useState } from 'react'
import { readSetting, SETTINGS_EVENT } from '../settingsStore'

/** 讀取設定並在任何地方修改後自動更新。 */
export function useSetting<T>(key: Parameters<typeof readSetting>[0], fallback: T): T {
  const [value, setValue] = useState<T>(() => readSetting<T>(key, fallback))
  useEffect(() => {
    const onChange = () => setValue(readSetting<T>(key, fallback))
    window.addEventListener(SETTINGS_EVENT, onChange)
    return () => window.removeEventListener(SETTINGS_EVENT, onChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return value
}
