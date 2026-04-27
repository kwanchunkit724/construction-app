# 建築工地管理系統 — 系統規格書
# Construction Site Management System — System Specification

**版本 Version:** 1.3.0  
**更新日期 Updated:** 2026-04-27  
**技術棧 Tech Stack:** React 18 + TypeScript + Vite + Supabase (PostgreSQL) + Tailwind CSS + PWA

---

## 一、系統概覽 System Overview

本系統為香港建築工地多角色管理平台，以手機優先 (Mobile-first) 設計，支援工地日常管理、問題追蹤、合約管理、安全監察、文件控制等功能，並以 PWA 形式部署，可安裝至手機主畫面離線使用。

---

## 二、用戶角色及訪問權限 Roles & Access

| 角色代碼 | 角色名稱 | 路由 | 主要功能 |
|---------|---------|------|---------|
| `super-admin` | 系統管理員 | `/admin` | 用戶管理、系統設定 |
| `pm` | 總監 (Project Manager) | `/pm` | 全局監控、財務、問題審批、合約管理 |
| `pe` | 工程師 (Project Engineer) | `/pe` | 技術監督、問題處理、進度追蹤 |
| `foreman` | 工頭 | `/foreman` | 工序分配、工人管理、問題指派 |
| `sub-supervisor` | 判頭 | `/sub-supervisor` | 工人帶領、問題解決、合約查閱 |
| `worker` | 工人 | `/worker` | 打卡簽到、問題上報 |
| `cp` | 安全主任 (CP) | `/cp` | 安全巡查、違規記錄 |
| `qs` | 工料測量師 (QS) | `/qs` | BOQ管理、工程量測算 |
| `site-agent` | 地盤代理 | `/site-agent` | 現場協調 |
| `doc-controller` | 文件管理員 | `/doc-controller` | 圖則及文件管理 |
| `qc` | 質量控制 (QC) | `/qc` | 質量巡查、測試記錄 |
| `procurement` | 採購 | `/procurement` | 物料採購、詢價 |
| `er` | 緊急應變 (ER) | `/er` | 緊急事故應對 |

---

## 三、功能模組詳情 Feature Modules

### 3.1 總監儀表板 (PMDashboard) — `/pm`

**標籤頁 Tabs:**
- **進度** — 工序進度追蹤（ProgressTracker）、工程量圖表
- **問題** — 問題追蹤板（IssueBoard）、全局問題概覽
- **人員** — 工地出勤統計、人員管理
- **財務** — BOQ（工程量清單）、VO（工程變更令）、成本分析
  - 支援匯出 Excel / PDF（使用 xlsx + jspdf-autotable）
- **日誌** — 工地日誌（DiaryContext）

---

### 3.2 工程師控制台 (PEConsole) — `/pe`

- 問題審批及技術意見
- 進度監控
- 圖則查閱

---

### 3.3 工頭應用 (ForemanApp) — `/foreman`

**標籤頁 Tabs:**
- **工序進度** — 查看及更新工序完成度
- **工人管理** — 出勤紀錄、工種分配
- **通訊匯報** — 向總監/工程師發送匯報
- **問題追蹤** — IssueBoard、可主動上報問題並指派至特定判頭

**問題指派流程：**
```
工頭發現問題
    ↓
填寫問題表格（類別、嚴重程度、位置、描述）
    ↓
選擇負責判頭（下拉選單）
    ↓
問題建立，assignedToId / assignedToName 寫入
    ↓
判頭收到問題（在問題追蹤板可見）
```

---

### 3.4 判頭應用 (SubSupervisorApp) — `/sub-supervisor`

**標籤頁 Tabs:**
- **進度更新** — 更新工序進度百分比
- **工人管理** — 管轄工人出勤、區域分佈
- **通訊匯報** — 向工頭/工程師/總監發送匯報
- **問題上報** — 查看被指派問題、上報新問題
- **我的合約** *(新增)* — 查看合約責任條款

**問題解決流程（判頭視角）：**
```
收到指派問題（assignedToId = 自己）
    ↓
    ├── 選項 A：解決並補相片
    │       ↓
    │   填入相片 URL → 問題狀態改為 resolved
    │       ↓
    │   系統自動記錄：[已解決] 姓名 已解決問題並提交相片記錄
    │
    └── 選項 B：轉交至其他判頭
            ↓
        選擇新判頭 + 填寫原因（必填）
            ↓
        問題轉交，系統記錄：[轉交] 姓名 將問題轉交至【新判頭】處理。原因：...
```

---

### 3.5 工人應用 (WorkerApp) — `/worker`

- 打卡簽到（掃碼 / 手動）
- 問題上報（照片 + 語音）
- 安全提示閱覽

---

### 3.6 安全主任 (CPSafety) — `/cp`

- 安全巡查記錄
- 違規事項追蹤
- 安全文件管理

---

### 3.7 工料測量師 (QSApp) — `/qs`

- BOQ 項目管理
- 工程量測算
- 成本預算追蹤

---

### 3.8 其他模組

| 模組 | 路由 | 核心功能 |
|------|------|---------|
| 地盤代理 | `/site-agent` | 現場協調及溝通 |
| 文件管理 | `/doc-controller` | 圖則版本控制、文件分發 |
| 質量控制 | `/qc` | QC 巡查、測試結果記錄 |
| 採購 | `/procurement` | 詢價、物料訂購 |
| 緊急應變 | `/er` | 事故上報、緊急聯絡 |

---

### 3.9 問題追蹤系統 (IssueContext + IssueBoard)

#### 三層上報架構 Three-Tier Escalation

```
層級 1 (sub-supervisor)  ←── 工人/判頭 提交問題
    ↓ 如問題無法解決 → escalateIssue()
層級 2 (foreman-pe)      ←── 工頭/工程師 處理
    ↓ 如問題無法解決 → escalateIssue()
層級 3 (pm)              ←── 總監 最終審批
```

#### 問題狀態流轉

```
open → in-progress → resolved / closed
```

#### 問題 Schema

```typescript
IssueReport {
  id, projectId, category, severity (normal/serious/urgent)
  location, drawingRef, description
  submittedBy, submittedByName, submittedByRole
  submittedAt, status, comments[]
  notifyIds[], photos[]
  currentTier: 'sub-supervisor' | 'foreman-pe' | 'pm'
  assignedToId?, assignedToName?   // 判頭指派
  resolvePhoto?                     // 解決相片
}
```

---

### 3.10 合約管理系統 (ContractContext + ContractApp) *(新增)*

#### 訪問路由：`/contracts`（僅 PM/PE 角色）

#### 功能：
- PM/PE 建立合約，填寫：
  - 合約編號、判頭、公司、工種、簽署日期、合約金額、文件參考
- 在合約內新增條款項目（ContractItem）：
  - 條款編號（如 3.2.1）、工種、責任描述、是否包含執垃圾、備註
- 判頭登入後在「我的合約」標籤查閱自己的合約條款

#### 合約 Schema

```typescript
SubContract {
  id, projectId, contractNo
  subContractorId, subContractorName, company, trade
  signedDate, value, items: ContractItem[]
  fileRef?, createdAt, createdBy
}

ContractItem {
  id, clauseNo      // e.g. "3.2.1"
  trade             // e.g. "泥水工程"
  description       // e.g. "清理施工垃圾及廢料"
  includesCleanup   // boolean
  notes?
}
```

#### 業務邏輯示例：
> 工頭發現「執垃圾」問題 → 查閱合約確認釘板判頭合約第 3.2.1 條包含執垃圾責任 → 把問題指派至該判頭

---

## 四、數據庫結構 Database Schema (Supabase)

### 現有表格 Existing Tables

| 表格名稱 | 主要字段 | 說明 |
|---------|---------|------|
| `profiles` | id, name, role, company, project_id | 用戶資料 |
| `issues` | id, project_id, category, severity, status, current_tier, assigned_to_id, assigned_to_name, resolve_photo, comments (jsonb), photos (jsonb) | 問題追蹤 |
| `progress_items` | id, project_id, task, zone, planned_pct, actual_pct | 工序進度 |
| `messages` | id, from, to (array), type, subject, body, read_by | 通訊系統 |
| `diary_entries` | id, project_id, date, weather, content | 工地日誌 |
| `safety_records` | id, project_id, type, location, severity | 安全記錄 |
| `qc_records` | id, project_id, check_type, result | 質量記錄 |
| `documents` | id, project_id, title, category, file_url | 文件管理 |
| `procurement_items` | id, project_id, item, qty, status | 採購記錄 |
| `cost_items` | id, project_id, category, amount | 成本記錄 |

### 待建立表格 Tables Pending Creation

| 表格名稱 | SQL |
|---------|-----|
| `sub_contracts` | 見下方 |

```sql
-- 建立 sub_contracts 表格
CREATE TABLE sub_contracts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  contract_no TEXT NOT NULL,
  sub_contractor_id TEXT NOT NULL,
  sub_contractor_name TEXT NOT NULL,
  company TEXT NOT NULL,
  trade TEXT NOT NULL,
  signed_date TEXT NOT NULL,
  value NUMERIC DEFAULT 0,
  items JSONB DEFAULT '[]',
  file_ref TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT NOT NULL
);

-- Row Level Security
ALTER TABLE sub_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read contracts"
  ON sub_contracts FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "PM/PE can insert contracts"
  ON sub_contracts FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "PM/PE can update contracts"
  ON sub_contracts FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "PM/PE can delete contracts"
  ON sub_contracts FOR DELETE
  USING (auth.role() = 'authenticated');
```

---

## 五、已解決問題 Issues Resolved

### v1.0 — 基礎系統建立

| # | 問題 | 解決方案 |
|---|------|---------|
| 1 | 各角色需要獨立的操作介面 | 建立 13 個角色專屬頁面，以 React Router 路由保護 |
| 2 | 數據需持久化至雲端 | 接入 Supabase，所有 Context 均有 Supabase 讀寫 |
| 3 | 手機上使用不方便 | PWA 設定，可安裝至手機主畫面 |
| 4 | 問題上報後無追蹤機制 | 建立三層上報架構，問題按嚴重性逐級處理 |
| 5 | 財務數據難以匯出 | 新增 Excel/PDF 匯出功能（BOQ、VO、進度報告）|

### v1.1 — 問題追蹤強化

| # | 問題 | 解決方案 |
|---|------|---------|
| 6 | 問題上報後不知道誰負責 | 加入問題指派功能，工頭可指定判頭負責 |
| 7 | 判頭無法解決問題時沒有出路 | 加入轉交功能，判頭可轉交至其他判頭（需填寫原因）|
| 8 | 問題解決後沒有記錄 | 加入「解決並補相片」功能，保存解決相片 URL |

### v1.2 — 手機介面優化

| # | 問題 | 解決方案 |
|---|------|---------|
| 9 | 手機上頁面標籤文字擠擁 | 改用 flex-col 佈局：手機顯示圖示+小字，桌面顯示橫排 |
| 10 | 多個頁面標籤樣式不一致 | 統一更新 CPSafety、DocControlApp、QSApp、SiteAgentApp、ProcurementApp、QCApp、PEConsole 的標籤樣式 |

### v1.3 — 合約管理系統

| # | 問題 | 解決方案 |
|---|------|---------|
| 11 | 問題發生後難以確認責任歸屬 | 建立合約管理系統，每項工作均對應合約條款 |
| 12 | 判頭不知道自己的合約責任範圍 | 判頭應用新增「我的合約」標籤，可查閱所有條款 |
| 13 | 執垃圾責任不明確 | ContractItem 加入 `includesCleanup` 標記，明確顯示是否包含清潔工作 |

---

## 六、待解決問題 Pending Issues / Roadmap

### 優先處理 High Priority

| # | 問題 | 計劃方案 |
|---|------|---------|
| P1 | Supabase `sub_contracts` 表格尚未建立 | 執行上方 SQL 於 Supabase Dashboard |
| P2 | 問題指派後判頭沒有推送通知 | 整合 Web Push Notifications 或 Supabase Realtime |
| P3 | 離線模式下新增記錄無法同步 | 實作 Workbox Background Sync |

### 中期計劃 Medium Priority

| # | 功能 | 說明 |
|---|------|------|
| M1 | 合約文件上載 | 支援上載 PDF 至 Supabase Storage，`fileRef` 直接存儲公開 URL |
| M2 | 問題相片上載至雲端 | 目前相片以 base64 存在 Supabase，應改用 Supabase Storage bucket |
| M3 | 問題統計儀表板 | PM 視角顯示問題數量趨勢、各判頭解決率 |
| M4 | 實時通知 | 使用 Supabase Realtime 訂閱問題狀態變更 |
| M5 | 合約版本控制 | 記錄合約修訂歷史，支援增補合約 (Supplementary Contract) |

### 長期計劃 Long-term

| # | 功能 | 說明 |
|---|------|------|
| L1 | 電子簽名 | 合約及報告支援電子簽署 |
| L2 | AI 問題分類 | 自動根據描述建議問題類別及嚴重程度 |
| L3 | 進度預測 | 根據歷史數據預測各工序完成日期 |
| L4 | 多項目支援 | 同一帳戶可管理多個工地 |
| L5 | 語音轉文字 | 工人可錄音描述問題，自動轉為文字 |

---

## 七、工作流程圖 Workflow Diagrams

### 7.1 問題上報及處理全流程

```
[工人/判頭] 發現問題
        ↓
    submitIssue()
    currentTier 設為 'sub-supervisor'
        ↓
[判頭] 在問題追蹤板看到問題
        ↓
    ┌── 自行解決 ──────────────────────────────────────────┐
    │   resolveWithPhoto(photo)                           │
    │   status → 'resolved'                               │
    │   記錄：[已解決]                                    │
    └─────────────────────────────────────────────────────┘
        ↓ 無法解決
    escalateIssue('foreman-pe')
    記錄：⬆ 問題已上報至【工頭/工程師】層級
        ↓
[工頭/工程師] 在問題追蹤板看到問題
        ↓
    ┌── 指派至判頭 ────────────────────────────────────────┐
    │   assignIssue(toId, toName)                         │
    │   記錄：[指派] 問題已指派至【判頭姓名】             │
    │        ↓                                            │
    │   [判頭] 收到指派問題                               │
    │        ↓                                            │
    │   ┌── 解決 ──────────────────────────────────────┐  │
    │   │   resolveWithPhoto(photo)                    │  │
    │   │   status → 'resolved'                        │  │
    │   └──────────────────────────────────────────────┘  │
    │        ↓ 轉交                                       │
    │   reassignIssue(toId, toName, reason)               │
    │   記錄：[轉交] 姓名 將問題轉交至【新判頭】 原因：...│
    └─────────────────────────────────────────────────────┘
        ↓ 繼續上報
    escalateIssue('pm')
    記錄：⬆ 問題已上報至【總監】層級
        ↓
[總監] 最終審批及處理
```

### 7.2 合約責任確認流程

```
[PM/PE] 上載合約
    ↓
在 /contracts 建立 SubContract
    ↓
逐一新增 ContractItem（條款號、工種、描述）
    ↓
[工頭] 發現問題 → 查閱相關工種合約
    ↓
確認責任條款（如第 3.2.1 條包含執垃圾）
    ↓
把問題指派至對應判頭
    ↓
[判頭] 在「我的合約」查閱責任範圍
    ↓
處理問題（解決 / 轉交）
```

### 7.3 新用戶入職流程

```
[Super Admin] 在 /admin 建立用戶帳號
    ↓
設定角色 (role)、姓名、公司、所屬項目
    ↓
用戶以電郵/密碼登入 /login
    ↓
系統根據 role 自動跳轉至對應頁面
    ↓
角色頁面只顯示該角色相關的功能
```

---

## 八、技術架構 Technical Architecture

```
┌─────────────────────────────────────────────────────┐
│                    前端 Frontend                     │
│  React 18 + TypeScript + Vite + Tailwind CSS        │
│  PWA (vite-plugin-pwa + Workbox)                    │
│                                                     │
│  Context Providers:                                  │
│  AuthContext → ProgressContext → IssueContext       │
│  ContractContext → SafetyContext → QCContext        │
│  DiaryContext → ProcurementContext → CostContext    │
│  DocumentContext                                    │
└──────────────────────┬──────────────────────────────┘
                       │ Supabase JS Client
┌──────────────────────▼──────────────────────────────┐
│                 後端 Backend (Supabase)              │
│  PostgreSQL Database                                │
│  Row Level Security (RLS)                          │
│  Auth (Email/Password)                             │
│  Storage (文件上載 — 計劃中)                        │
│  Realtime (推送通知 — 計劃中)                       │
└─────────────────────────────────────────────────────┘
```

---

## 九、部署資訊 Deployment

- **建置指令:** `npm run build`
- **輸出目錄:** `dist/`
- **建議部署平台:** Netlify / Vercel / Cloudflare Pages
- **環境變數:**
  ```
  VITE_SUPABASE_URL=https://xxxx.supabase.co
  VITE_SUPABASE_ANON_KEY=eyJ...
  ```

---

*文件由系統自動生成 · Generated 2026-04-27*
