# ESP32 Drone

ESP32 無人機的地面控制站 (GCS)：用搖桿在電腦上操控、看即時影像、在地圖上看到無人機位置。

```
搖桿 ─▶ React 介面 ──Socket.IO──▶ Python 橋接程式 ──USB 序列埠 (預設) 或 Wi‑Fi WebSocket──▶ 地面站 ESP32 ──ESP‑NOW──▶ 飛機 ESP32
          ▲                          │  ▲
          └────── 遙測 (Geohash) ◀────┘  └── 相機 (OpenCV MJPEG)
```

## 專案結構

```
.
├─ apps/
│  ├─ web/        React + Vite + TypeScript 前端 (儀表板、地圖、設定)
│  └─ bridge/     Python 橋接程式 (Flask + Socket.IO)：控制、遙測、相機、設定、飛行紀錄
│     └─ tests/   pytest 單元測試
├─ hardware/      PlatformIO 韌體 (drone / ground)
├─ data/          執行期資料：settings.json、flights/ (不進版本控制)
├─ docs/          架構與協定文件
└─ package.json   npm workspace 根目錄 (統一的開發指令)
```

## 快速開始

需求：Node.js 20+、Python 3.10+。

```bash
npm install                 # 安裝前端與開發工具
npm run setup:bridge        # 安裝 Python 相依套件 (apps/bridge/requirements.txt)

npm run dev                 # 同時啟動前端 (http://localhost:5173) 與橋接程式 (:5000)
npm run dev:sim             # 同上，並啟動 GPS 模擬器 (沒有實機也能測試地圖)
```

其他指令：`npm run typecheck`、`npm run lint`、`npm run build`、`npm test` (Python 測試，需先 `pip install -r apps/bridge/requirements-dev.txt`)。

## 連線到地面站

預設走 Wi‑Fi：電腦連上地面站的 AP `Drone_GCS_Relay`，橋接程式會連 `192.168.4.1` 的 WebSocket。
在 **設定 → Other Settings** 可以切換成 USB 序列埠、改地面站位址，或啟動 GPS 模擬器。

> 解鎖流程：油門必須在最低點，按下「Start Up」才會解鎖；按「Emergency Stop」立即鎖定；
> 控制訊號中斷超過 0.5 秒會自動鎖定。

## GPS / 地圖

遙測以 **Geohash** 為主 (見 [docs/telemetry-protocol.md](docs/telemetry-protocol.md))。橋接程式解碼之後推送給前端，地圖會：

* 以無人機位置為中心 (拖曳地圖或按 ◎ 可切換跟隨)
* 依航向旋轉 (HDG = 航向朝上；N = 北朝上)，左上角羅盤指向北方
* 畫出飛行軌跡、起飛點 (H) 與航點，並顯示 Geohash 精度圓圈

目前 `hardware/` 的韌體還不會送出 GPS；任何來源都可以用 `POST /telemetry` 或在序列 / WebSocket 文字行送入遙測。

## 文件

* [docs/architecture.md](docs/architecture.md) — 架構圖與 API 一覽
* [docs/telemetry-protocol.md](docs/telemetry-protocol.md) — 遙測格式與韌體要送什麼
