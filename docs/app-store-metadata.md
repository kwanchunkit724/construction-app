# App Store Connect — Metadata 草稿

直接 copy 入 App Store Connect 對應欄位即可。中英文都備好。

---

## App Information

| 欄位 | 內容 |
|------|------|
| **App Name** (zh-Hant) | 關春傑工程管理 |
| **App Name** (en) | CK Construction Management |
| **Subtitle** (zh-Hant，最多 30 字) | 工地進度・問題追蹤・推送通知 |
| **Subtitle** (en，最多 30 chars) | Site Progress & Issue Tracker |
| **Bundle ID** | com.kwanchunkit.constructionapp |
| **SKU** | kwan-chun-kit-construction-001 |
| **Primary Category** | Business |
| **Secondary Category** | Productivity |
| **Age Rating** | 4+ |

---

## Description (繁中 zh-Hant)

> 為地盤管理而設嘅一站式平台。從項目經理（PM）、判頭、判頭工人、業主到主承建商員工，每個角色都有合適嘅工具去管理項目進度、追蹤現場問題、處理申請審核。
>
> ▍主要功能
> • 工地項目管理：admin 創建項目並指派 PM
> • 帳號申請＋逐層審核（PM 審核總承建商員工/業主，判頭審核工人）
> • 進度追蹤：分區結構、層級項目、樓層模式或百分比模式、自動匯總
> • 進度更新歷史：完整 audit trail
> • 指派負責人＋委派判頭
> • 問題追蹤：附現場照片、多層遞進處理（工人→判頭→主承建商→PM）
> • 即時推送通知（Push Notifications）
> • 跨裝置即時同步
> • 完整支援繁體中文
>
> ▍適用對象
> • 工程公司管理層（Admin）
> • 項目經理（PM）
> • 主承建商員工（工程師、管工、安全部）
> • 判頭與判頭工人
> • 業主代表
>
> 本應用程式專為香港建築工程行業而設，介面簡潔直觀，支援 iPhone 上手機形式設計。

---

## Description (English)

> An all-in-one site management platform for construction professionals.
> Whether you're a Project Manager (PM), main contractor staff, subcontractor,
> subcontractor worker, or owner — each role has the right tools to manage
> project progress, track on-site issues, and handle membership approvals.
>
> ▍ Key Features
> • Project management: admin creates projects and assigns PMs
> • Account application & multi-level approval workflow
> • Progress tracking: zone-based structure, hierarchical items,
>   floor-mode or percentage-mode, automatic roll-up
> • Progress update history: full audit trail
> • Owner assignment & subcontractor delegation
> • Issue tracking: with on-site photos, multi-tier escalation
>   (worker → subcontractor → main contractor → PM)
> • Real-time push notifications
> • Cross-device live sync
> • Traditional Chinese interface
>
> ▍ Designed For
> • Construction company management
> • Project Managers
> • Main contractor staff (engineers, foremen, safety officers)
> • Subcontractors and their workers
> • Project owners
>
> Built specifically for the Hong Kong construction industry with
> mobile-first design optimised for iPhone.

---

## Keywords (100 字符上限，逗號分隔)

### 中文（繁中）
```
工地管理,工程管理,進度追蹤,問題追蹤,判頭,項目經理,建築,建造業,香港工程
```
（92 字符 ✓）

### English
```
construction,site,project,management,progress,issue,tracking,contractor,PM,Hong Kong
```
（85 字符 ✓）

---

## Promotional Text (170 字符上限，無需 Apple Review 即可改)

### 中文
> 全新版本！新增儀表板、Excel/PDF 匯出、用戶管理頁。即時推送通知，多裝置同步無縫銜接。

### English
> New: Dashboard, Excel/PDF export, user management. Real-time push notifications, seamless multi-device sync.

---

## What's New / Release Notes (4000 字符上限)

### 中文
> 首個正式版本上架。
>
> 主要功能：
> • 工地項目管理 + PM 指派
> • 角色申請＋審核流程
> • 進度追蹤（樓層／百分比模式）
> • 多層問題追蹤＋現場照片
> • 即時推送通知

### English
> First official release.
>
> Highlights:
> • Project management & PM assignment
> • Role-based application & approval flow
> • Progress tracking (floor / percentage mode)
> • Multi-tier issue tracking with on-site photos
> • Real-time push notifications

---

## Support / Marketing URLs

- **Support URL** (必填): `https://construction-app-lime-six.vercel.app/`
- **Marketing URL** (選填): `https://construction-app-lime-six.vercel.app/`
- **Privacy Policy URL** (必填): `https://construction-app-lime-six.vercel.app/privacy-policy.html`

⚠️ **Privacy Policy URL** 一定要 deploy 後可以公開訪問。我已經寫好放喺 `public/privacy-policy.html`，下次 push 到 main 後 Vercel 會自動 host。

---

## App Privacy Declaration（在 App Store Connect → App Privacy）

對 Apple 嘅 privacy questionnaire 嘅答案：

### Data Collected? **Yes**

| 資料類別 | Linked to User? | Used for Tracking? | 用途 |
|----------|----------------|-------------------|------|
| Phone Number | Yes | No | App Functionality（帳號識別） |
| Name | Yes | No | App Functionality |
| Photos | Yes | No | App Functionality（問題報告） |
| User Content (notes, messages) | Yes | No | App Functionality |
| Device ID | Yes | No | App Functionality（推送通知 routing） |

### Data NOT Collected
- Location
- Contacts
- Browsing history
- Search history
- Health & fitness
- Financial info
- Sensitive info
- Diagnostics（除非系統 crash log，由 Apple 處理）

### Tracking
**No** — App 唔做 cross-app/cross-website tracking、唔同其他公司分享資料做廣告。

---

## Demo Account (App Review 必需)

Apple 會用 demo account 測試你嘅 App。提供：

```
Phone: 91234567
Password: admin1234
Role: 系統管理員（Admin，可以見到全部功能）
```

⚠️ 喺 Submit for Review 嗰頁要填上面個 credentials 喺 "Sign-in Information" 部分，否則 Apple 會 reject 因為唔知點測試。

---

## App Review Information

| 欄位 | 內容 |
|------|------|
| First Name | Kwan Chun Kit |
| Last Name | （你個姓） |
| Phone | （你嘅聯絡電話，國碼 +852）|
| Email | kck980724@gmail.com |
| Notes (optional, 4000字) | 見下 |

### Notes for Review
> This app is a B2B construction management tool for Hong Kong construction
> professionals. Sign-in is by phone number. A demo admin account is provided
> in Sign-in Information.
>
> Camera / Photo Library is only accessed when reporting issues.
> Push notifications are used to alert users of issue assignments and
> approval decisions — never for marketing.
>
> Privacy policy: https://construction-app-lime-six.vercel.app/privacy-policy.html

---

## Pricing & Availability

- **Price**: Free
- **Availability**: 香港（Hong Kong）—— 視乎你想公開到邊度
  - 建議先只開 Hong Kong，未來再擴展
- **Pre-orders**: No
