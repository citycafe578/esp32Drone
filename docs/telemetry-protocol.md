# 遙測 / GPS 協定

橋接程式接受三種格式，每行一筆，UTF-8 文字。來源可以是地面站的 USB 序列埠、地面站 WebSocket 的文字訊框，
或任何程式對 `POST /telemetry` (JSON) 送入。

| 格式 | 範例 |
|---|---|
| JSON | `{"geohash":"wsqqqxy1k","heading":123.4,"alt":1.8,"speed":0.6,"battery":11.7,"sats":9}` |
| CSV | `GEO,wsqqqxy1k,123.4,1.8,0.6,11.7,9` (欄位依序：geohash, heading, alt, speed, battery, sats；可留空) |
| 純 Geohash | `wsqqqxy1k` |

| 欄位 | 單位 | 說明 |
|---|---|---|
| `geohash` | — | base32，1–12 字元。**建議 9 字元 (約 ±2.4 m)**。 |
| `heading` | 度 | 0 = 北，順時針。沒有提供時，橋接程式用連續兩點的位移方向推算 (位移 < 1.5 m 時沿用上一個值)。 |
| `alt` | 公尺 | 相對高度。 |
| `speed` | m/s | |
| `battery` | 伏特 | |
| `sats` | 顆 | |

也接受 `lat` / `lng` (十進位度) 取代 `geohash`。欄位別名：`gh`、`hdg`/`course`、`altitude`/`height`、`bat`/`vbat`、`lon`。

## 前端收到的 `telemetry` 事件

```json
{
  "ts": 1760000000.1, "geohash": "wsqqqxy1k",
  "lat": 25.0477, "lng": 121.5831, "accuracy_m": 2.39,
  "heading": 45.0, "heading_source": "sensor",
  "alt": 2.5, "speed": 1.0, "battery": 11.1, "sats": 8,
  "home": {"lat": 25.0477, "lng": 121.5831}, "distance_home": 0.0
}
```

* 第一筆定位自動成為起飛點；可用地圖上的 **H** 按鈕或 `POST /home` 重設。
* 3 秒沒有新資料，前端把圖示變灰並顯示 `GPS LOST`。
* 有定位資料時會自動錄成飛行紀錄，10 秒沒有資料就存成 `data/flights/flight_YYYYmmdd_HHMMSS.json`。

## 韌體要做什麼 (之後)

地面站韌體只要在收到飛機的 GPS 後，往 `Serial.println()` 或 WebSocket 文字訊框送一行 `GEO,<geohash>,<heading>,<alt>,...` 即可，
不需要再改橋接程式。

## 測試

```bash
npm run dev:sim                                   # 內建模擬器 (繞圈飛行)
curl -X POST localhost:5000/telemetry -H 'Content-Type: application/json' \
     -d '{"geohash":"wsqqqxy1k","heading":90,"alt":1.5}'
```
