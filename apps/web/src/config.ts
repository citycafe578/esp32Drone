/** 後端橋接程式 (python/cv.py) 的位址。可用 VITE_API_URL 覆寫。 */
export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? `http://${window.location.hostname}:5000`
