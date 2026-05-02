# Screenshots 指南

App Store **iPhone 6.7" 尺寸**（1290 × 2796 px）需要至少 **3 張**，最多 10 張。
建議 **6 張**，按以下順序排（順序好重要 — 第 1 張係 thumbnail，最影響下載率）。

---

## 推薦順序

### 1. Hero — 登入頁（賣點：簡潔，手機號登入）
- 路徑：Login 頁
- 截圖：完整 login screen，橙色 ⛑ icon + 「建築工程管理」title + 手機號輸入欄
- Caption（覆蓋文字）：**「手機號一鍵登入」**

### 2. 工地清單（賣點：管理多個項目）
- 路徑：Admin → 管理 tab，建幾個 project（例如「廣東道 39 號」、「中環中心」、「機場第三跑道」），返管理頁
- 截圖：3 個 project 卡片，包括分區、PM 數、操作按鈕
- Caption：**「Admin 一站管理所有工地」**

### 3. 進度追蹤（賣點：分區匯總、層級結構）
- 路徑：點任何工地 → 進度 tab，**展開幾個分區**，每個分區內加入大項＋細項，並設定唔同進度（例如 75%、30%、100%）
- 截圖：3 個 zone section 顯示進度條 + 統計卡 + 大項細項展開
- Caption：**「分區自動匯總，樓層或百分比追蹤」**

### 4. 問題追蹤（賣點：現場照片、多層遞進）
- 路徑：點工地 → 問題 tab，建 1-2 個有照片嘅問題
- 截圖：問題卡片清單，左邊有照片 thumbnail + 角落顯示張數
- Caption：**「現場拍照即時上報，逐層遞進處理」**

### 5. 問題詳情（賣點：完整 timeline + actions）
- 路徑：點任何問題進入詳情頁
- 截圖：問題標題、描述、3 欄相片、狀態 pill、處理層、行動 buttons、活動記錄
- Caption：**「完整事件記錄，一目了然」**

### 6. 報告問題（賣點：拍照 / 從相簿選）
- 路徑：「報告新問題」按鈕，揀幾張相片
- 截圖：modal 開咗，相片 grid 顯示 + 「拍照」「從相簿選」按鈕
- Caption：**「即影即報，最少一張現場照片」**

---

## 怎樣截圖

### 方法 A：用 iPhone 截圖（最真實）
1. 喺 iPhone 開新版 App
2. 用 **iPhone 14 Pro Max / 15 Pro Max / 16 Pro Max**（呢三款都係 6.7"）
3. 同時按 **音量上 + 側邊鍵** → 截圖
4. AirDrop / iCloud 傳到 Mac

### 方法 B：用 iOS Simulator（如果有 Mac）
1. 開 Xcode → Open Developer Tool → Simulator
2. 揀 **iPhone 16 Pro Max**
3. 喺 Safari 開 https://construction-app-lime-six.vercel.app
4. 登入 + 截圖：`Cmd + S`
5. 截圖會自動存喺桌面，名為 `Simulator Screenshot ...`

### 方法 C：Vercel + Chrome DevTools（最方便，但唔係真實裝置）
1. Chrome 開 https://construction-app-lime-six.vercel.app
2. 開 DevTools (F12) → 切到 mobile mode (Ctrl+Shift+M)
3. 設裝置為 **「iPhone 14 Pro Max」**（1290×2796）
4. 直接 right-click → 「Capture screenshot」或用 extension

⚠️ Apple 偏好真實 iPhone 嘅截圖，唔好用 Chrome 模擬版本如果你有 iPhone。

---

## 文字覆蓋（optional 但推薦）

每張截圖可以加一句 caption（中文 + 英文），會大幅提高下載率。

工具推薦：
- **Figma**（免費）— 開個 1290×2796 frame，貼截圖，加文字
- **Canva**（免費）— 有 App Store Screenshot 模板
- **Screenshots Pro**（付費）— 一鍵生成多語言版本

---

## 上傳到 App Store Connect

1. 登入 https://appstoreconnect.apple.com
2. 你個 App → 揀 version → iOS App
3. 滾到 **App Previews and Screenshots**
4. iPhone 6.7" Display → Drop 6 張圖（按推薦順序）
5. 順便上 6.5"（1242×2688）— 可以用相同尺寸 resize 或重新截
6. iPad Pro 12.9"（如有支援）

---

## 備註

- Apple 唔再強制要求 6.5"，但有最好（覆蓋舊機型）
- iPad 截圖 optional — 因為 App 主要係 iPhone 用，但有就更專業
- **唔好放虛假內容**（例如假 fake review、假 screenshot UI 唔係真嘅 App）— Apple 會 reject
