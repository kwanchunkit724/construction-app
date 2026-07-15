# Android 上架執行包 — 即用版（CK工程 · com.kwanchunkit.constructionapp）

> Build / 簽名 config 已經 ready（codemagic `android-play-store` workflow → 簽名 AAB，版本 1.4）。
> 下面係**你貼上去就用**嘅 listing 文案、Data Safety、內容分級答案、keystore 指令。
> **真正卡住嘅只係 Google Play 帳戶身份驗證（你做）** —— verify 完，照呢份 30 分鐘上到。

---

## ✅ 已經 ready（我做咗）
- `android/app/build.gradle`：release 簽名讀 `CM_KEYSTORE_*` env，版本 fallback 升到 1.4。
- `codemagic.yaml` → `android-play-store` workflow：`bundleRelease` 簽名 AAB、`VERSION_NAME=1.4`、versionCode 用 CI 遞增值。
- targetSdk 36（過 Google API-35 底線）。

## 🔴 只有你做到（帳戶 / 法律 / 錢 / 密碼）
1. ☐ **決定 Organization（建議）vs Personal** —— Org 豁免 12 測試員/14 日 gate，但要 D-U-N-S 號碼（D&B HK，免費，~30 工作天）。**即刻去申請 DUNS（長 pole）。**
2. ☐ 完成 **Google Play 身份驗證**（交證件 + US$25 一次性費）→ 等 Google「verified」。← **現時唯一 blocker。**
3. ☐ 產生 **upload keystore**（指令喺下面）+ **自己保管密碼**（password manager + 離線備份）→ load 入 Codemagic。
4. ☐ 開 Play Console app → 貼下面 listing → 上載 AAB → 開 Internal Testing → 之後 production。

---

## 📝 商店 listing 文案（zh-HK，貼上去就用）

**App 名稱**（≤30 字）：
`CK工程 — 工地管理`

**簡短描述**（≤80 字）：
`工地進度、指令簽核、問題追蹤、工作許可證、文件管理，一個系統管好成個地盤。`

**完整描述**（≤4000 字）：
```
CK工程係專為香港地盤判頭、工地主任同總承建商而設嘅工地管理應用。將分散喺 WhatsApp、紙同記憶嘅嘢，全部收喺一個系統 —— 每一個指令、簽核、進度同問題都有時間記錄、改唔到，嘈交都查得返。

【主要功能】
• 進度表：大／中／細項，配合唔同工程類型 —— 百分比、樓層、清單（小型工程）、量度（渠務計米數）、單位狀態（大樓維修）。
• 工地指令 (SI) → 變更指令 (VO)：版本化、港幣金額由系統計、可設審批鏈、批核後鎖定。
• 工作許可證 (PTW)：動火／高空／吊運，電子簽核 + QR 掃描核實 + 火警看守計時。
• 問題追蹤：判頭 → 總承建商 → 項目經理 自動升級。
• 文件管理：物料送審、施工方案、圖則、檢驗記錄，逐項連住進度表，送審→批准流程齊全。
• 每日日誌、物料、行事曆、聯絡人、離線查閱。

【為香港而設】
全廣東話介面、香港地盤術語、港幣報價、八種地盤角色按工地獨立權限。日日用就自動產生 ISO 9001 級記錄，方便接政府工程。

支援帳號自助刪除。
```

**其他欄位：**
- 分類 (Category)：Business（商業）/ 或 Productivity
- 標籤：construction, site management, 工地, 判頭
- 私隱政策 URL：用返 iOS 同一條（App Store 嗰條）
- 聯絡 email：你的支援 email

## 🖼 需要嘅圖（規格）
- App icon 512×512 PNG（用返 iOS 同一個）
- Feature graphic 1024×500 PNG
- 手機截圖 ≥2 張（1080×1920 或類似）：進度表、PTW QR、文件總覽
- （可選）平板截圖
> 截圖可以直接喺 BlueStacks（1600×900）或手機影，揀最能展示「審計記錄」嘅畫面。

## 🔐 Data Safety form 答案（草擬，你確認）
- **收集資料**：是。
  - 個人資料：姓名、電話號碼（用嚟登入，phone+password）。
  - 相片：用戶上載嘅圖則／許可證／問題相片（App 功能）。
  - 應用程式活動：進度／簽核記錄（核心功能）。
  - 裝置 ID：推送通知 token（OneSignal）。
- **資料用途**：App 功能（account、push）。**唔會**賣俾第三方、**唔會**用嚟賣廣告。
- **加密傳輸**：是（HTTPS / Supabase）。
- **用戶可要求刪除**：是（App 內帳號刪除，符合規定）。
- **位置**：如有用 GPS 標記指令位置 → 申報「概略位置」，否則「否」。（核對你 App 實際有冇用 GPS。）

## 🎯 內容分級 (IARC) 答案（草擬）
- 類型：工具 / 商業應用，**無**暴力、性、賭博、粗口、毒品內容。
- 用戶生成內容：有（地盤相片／文字），但屬企業內部、有審核。
- 預期分級：**3+ / Everyone**。

## 🔑 產生 upload keystore（你喺自己電腦跑一次，JDK 21）
```
keytool -genkey -v -keystore upload-keystore.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
```
- 記住 store password + key password（**寫低喺 password manager + 離線備份一份**）。
- **唔好遺失** —— 跌咗就再上唔到更新（Play 會拒收唔同 upload key 簽嘅 AAB）。
- base64 encode 俾 Codemagic：
```
openssl base64 -A -in upload-keystore.jks -out upload-keystore.jks.b64
```
- 喺 Codemagic → Environment groups → `android_play_store_credentials`（secure）入：
  - `CM_KEYSTORE` = `upload-keystore.jks.b64` 內容
  - `CM_KEYSTORE_PASSWORD` / `CM_KEY_ALIAS`（= upload）/ `CM_KEY_PASSWORD`
- 然後 Codemagic UI 手動 run `Android Play Store Release` → 攞個簽名 `.aab` → 上 Play Console。

## ⏱ 之後出新版
- 每次：CI 自動 bump versionCode + versionName（1.4→1.5）→ build 簽名 AAB → 上 production track → 寫 release notes → submit（會 re-review，通常 1-3 日）。用 staged rollout 5%→100%。
- iOS 完全唔受影響。

---

## 👉 你而家實際要郁
1. **去 D&B HK 申請 D-U-N-S**（如果揀 Org，呢個係長 pole，即刻做）。
2. **完成 Google Play 身份驗證**（交證件 + US$25）。
3. 驗證／DUNS 搞掂後話我知 → 我幫你最後 wire + 教你跑 AAB build + 上 listing。
> 文案／Data Safety／分級已經喺上面，你 verify 完直接貼。

---

## 📝 正式版 Release Notes（zh-HK，≤500 字，貼上去就用）

```
CK工程 — 香港地盤管理系統，一個 app 管好成個工地。

• 進度表：百分比／樓層／清單／量度（渠務計米）／單位狀態（大樓維修 MBIS·MWIS）多種模式
• 工地指令 SI → 變更指令 VO：版本化、港幣計價、可設審批鏈
• 工作許可證 PTW：動火／高空／吊運，電子簽核 + QR 掃描核實 + 火警看守計時
• 問題追蹤：判頭→總承建商→PM 自動升級，附編號同位置
• 文件管理：物料送審／施工方案／圖則／檢驗，送審死線提醒、一鍵重新送審
• 每日日誌：出勤人數、機械、上晝／下晝天氣 + 天文台警告信號、複製琴日
• 平安咭登記、聯絡人、行事曆、離線查閱

全程廣東話介面、香港地盤術語、港幣報價。日日用自動產生 ISO 9001 級審計記錄，支援帳號自助刪除。
```

> 第一個 production release 用呢段。之後出新版逐版寫「今次改咗咩」。
