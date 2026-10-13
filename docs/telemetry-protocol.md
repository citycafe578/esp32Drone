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

## 飛機 ↔ 地面站 ESP-NOW 封包

| type | 方向 | 內容 |
|------|------|------|
| 0 | 地面站 → 飛機 | 控制：throttle, roll, pitch, yaw, cmd (0 一般 / 1 ARM / 2 KILL / 3 MPU 校正 / 4 清除校正) |
| 1 | 地面站 → 飛機 | 調參：axis[16], p, i, d |
| 2 | 飛機 → 地面站 | 遙測 (每 0.2 秒)，欄位見下表 |
| 3 | 地面站 → 飛機 | 要求回報目前 PID |
| 4 | 飛機 → 地面站 | 單一軸的 PID：axis[16], p, i, d (收到 type 3 後逐軸回覆 5 筆) |

遙測封包 (type 2)：

| 欄位 | 型別 | 說明 |
|------|------|------|
| type | uint8 | 固定 2 |
| geohash | char[12] | 無定位時全 0 |
| heading | int16 | 度，0=北 |
| alt_cm | int16 | 公分 |
| speed_cms | uint16 | 公分/秒 |
| battery_mv | uint16 | 毫伏，0 = 未量測 |
| sats | uint8 | 衛星數 |
| roll_cd / pitch_cd | int16 | 百分之一度，水平為 0 |
| flags | uint8 | bit0 已解鎖、bit1 MPU 校正中、bit2 MPU 已校正 |

飛機端 (`hardware/drone/main.cpp`) 的 `TelemetryTask` 負責送出。GPS 與電池是選配，在檔案開頭的設定區改腳位：

* GPS：`GPS_RX_PIN` / `GPS_TX_PIN` / `GPS_BAUD`，預設 20 / 21 / 9600；設 -1 停用。沒有定位時 geohash 為空，地面站不會送 `GEO` 行，只送 `STATUS`。
* 電池：`BATTERY_ADC_PIN` (預設 -1 停用) 與 `BATTERY_DIVIDER` (電阻分壓倍數)。

MPU 校正不會卡在 ESP-NOW 回呼裡：回呼只設旗標，由 FlightTask 在未解鎖時執行 (約 1.5 秒)，期間 `flags` 的 bit1 為 1。

## 地面站 → 電腦的文字行

不論 USB 序列或 Wi‑Fi (WebSocket 文字訊框)，內容相同：

* `GEO,<geohash>,<heading>,<alt m>,<speed m/s>,<battery V>,<sats>`
* `STATUS,<地面站解鎖>,<飛機回報距今 ms，-1 為從未收到>,<飛機解鎖，-1 未知>,<roll>,<pitch>,<電池 V>,<飛機旗標>`，每 0.5 秒
* `PID,<軸>,<p>,<i>,<d>`：收到 GET_PID 後，地面站向飛機要實際的值再轉出；飛機 0.6 秒內沒回的軸用地面站快取補上。Wi‑Fi 模式用 `GET /pid` 取得同樣的文字行。

## 測試

```bash
npm run dev:sim                                   # 內建模擬器 (繞圈飛行)
curl -X POST localhost:5000/telemetry -H 'Content-Type: application/json' \
     -d '{"geohash":"wsqqqxy1k","heading":90,"alt":1.5}'
```
