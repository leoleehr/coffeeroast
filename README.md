# 畫素微量烘焙咖啡 · Pixel Cafe' Nano-Rostery (coffeeroast)

**線上 POC**：https://leoleehr.github.io/coffeeroast/（推到 `main` 會自動重新部署，見
`.github/workflows/deploy-web.yml`）。未設定 Supabase 時會自動使用 `src/demo/` 的示範資料，方便直接
檢視整個 UI/UX；新增/編輯只在當次瀏覽中生效，重新整理會重置。

跨平台咖啡烘焙記錄 App — 即時記錄烘焙溫度曲線、事件標記（回溫點 / 脫水 / 一爆 / 二爆 / 下豆）、
生豆型錄，資料以 Supabase 雲端同步。重寫自舊版 Windows FoxPro 程式 `cafe4`。

- **框架**：Expo (React Native) + TypeScript + expo-router
- **後端**：Supabase (Postgres + Auth + RLS)
- **平台**：iOS / Android（Expo Go 或 dev build）、Windows 透過 Web/PWA
- **溫度來源**：`src/sensors/` 的 `Sensor` 介面，三種實作：
  - `MockSensor` — 模擬訊號，任何環境可用（預設）
  - `WebSerialSensor` — Web Serial API，桌面版 Chrome/Edge（Windows）連 USB 溫度轉接器
  - `BleSensor` — `react-native-ble-plx`，**需要 dev build**（Expo Go 無法載入原生模組）
  在「設定 → 溫度感測器」選擇、掃描配對、設定 UUID 與資料格式，選擇會存到裝置。

## 開發環境設定

```bash
npm install
cp .env.example .env.local        # 填入 Supabase URL 與 anon key
npm run web                       # 瀏覽器（Windows 用）
npm run android                   # Android 模擬器 / 實機
npm start                         # 掃 QR code 用 iPhone 的 Expo Go 開啟
```

沒有填 `.env.local` 也能啟動，App 會顯示設定提示，但無法登入或存取資料。

## Supabase 設定

1. 建立 Supabase 專案。
2. SQL Editor 依序貼上並執行：
   - `supabase/migrations/0001_init.sql`（建表 + RLS + 新使用者觸發器）
   - `supabase/migrations/0002_phase2_inventory.sql`（拼配、庫存 view 與函式）
3. Authentication → Providers 開啟 Email（開發時可關閉 email 驗證以加速）。
4. 把 Project URL 與 anon key 填入 `.env.local`。

## Google 登入 + Google Drive 備份設定

登入頁的「使用 Google 登入」與設定頁的「Google 雲端硬碟備份」需要先完成以下設定
（需求：Supabase 專案已建立）。登入走 Supabase 的 Google provider，Drive 備份用
登入時取得的 Google `provider_token` 直接呼叫 Drive REST API，把每筆烘焙存成 JSON
放進使用者 Drive 根目錄的資料夾「畫素微量烘焙咖啡」（`drive.file` scope，只能存取
App 自己建立的檔案，不需 Google 敏感範圍審查）。

1. **Google Cloud Console**（<https://console.cloud.google.com>）
   - 建立專案 → 「API 和服務」→「OAuth 同意畫面」：User Type 選 **External**，
     範圍加入 `openid`、`.../auth/userinfo.email`、`.../auth/userinfo.profile`、
     `https://www.googleapis.com/auth/drive.file`；在「測試使用者」加入自己的 Google 帳號。
   - 「憑證」→「建立憑證」→「OAuth 用戶端 ID」→ 應用程式類型 **網頁應用程式**：
     - 已授權的重新導向 URI：`https://<PROJECT-REF>.supabase.co/auth/v1/callback`
     - 已授權的 JavaScript 來源：`http://localhost:8081`、
       `https://leoleehr.github.io`
   - 記下 Client ID 與 Client Secret。
2. **Supabase Dashboard**
   - Authentication → Providers → Google：啟用，填入上面的 Client ID / Client Secret。
   - Authentication → URL Configuration → Redirect URLs 加入：
     `http://localhost:8081/**`、
     `https://leoleehr.github.io/coffeeroast/**`、
     `coffeeroast://**`、`exp://**`（Expo Go 用）。
3. 不需在 `.env.local` 加任何東西 —— Client Secret 只放在 Supabase 後端。
4. Google 授權的 access token 約 1 小時到期，Supabase 不會自動續期；到期後
   在設定頁按「重新連結 Google」即可。烘焙一定會先存進 Supabase，備份失敗不影響資料。

## 專案結構

```
src/
  app/            expo-router 路由
    (auth)/       登入
    (tabs)/       首頁 / 烘焙記錄 / 生豆 / 庫存 / 設定
    roast/        start → live → summary → [id]
    beans/        new / [id]
    suppliers/    供應商 CRUD
    blends/       拼配配方 CRUD
    stock/        lots/[beanId]（進貨批次）、new-lot、roasted（熟豆出入庫）
  sensors/        Sensor 介面 + MockSensor / BleSensor / WebSerialSensor + parsers + Provider
  demo/           未設定 Supabase 時的示範資料與記憶體資料層（讓 POC 可直接檢視）
  auth/           Supabase session provider
  components/     UI kit、圖表、清單列
  db/             react-query hooks（beans / roasts）+ 型別
  roast/          sessionStore（烘焙中狀態）、roastMath（RoR / DTR / 失重）
  sensors/        Sensor 介面 + MockSensor
  i18n/           zh-TW 字串
```

## 路線圖

- **階段 1（完成）**：登入、生豆型錄、即時烘焙（模擬）、烘焙曲線、雲端同步
- **階段 2（完成）**：供應商、生豆進貨批次、烘焙時扣生豆庫存、熟豆庫存與出入庫、拼配配方
- **階段 3（完成）**：感測器抽象層（模擬 / Web Serial / BLE）+ 設定頁選擇與配對、
  雙曲線比較（烘焙記錄頁 → 比較鈕）、烘焙記錄匯出 CSV / PNG
- **Google 登入 + Drive 備份（完成）**：「使用 Google 登入」（走 Supabase Google
  provider）、烘焙儲存時自動把該筆 JSON 備份到使用者 Google Drive、設定頁可手動
  「立即備份 / 全部重新備份」。設定見上方〈Google 登入 + Google Drive 備份設定〉。

### 藍牙 dev build

Expo Go 不能載入 `react-native-ble-plx`。要用藍牙：

```bash
npx expo run:android          # 需 Android Studio；產生可裝的 dev build
# 或用 EAS 雲端打包（不需 Mac）：
npx eas build --profile development --platform android
```

app.json 已含 `react-native-ble-plx` 與 `expo-dev-client` 外掛設定。
