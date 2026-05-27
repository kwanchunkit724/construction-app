# iOS TestFlight v1.1 Test Checklist

Build: ios-testflight #84 (commit `6401b50`)
Version: 1.1 (CFBundleShortVersionString)
Target: iPhone via TestFlight app
Test accounts (all password `test1234`):
- `60001001` 李 PM (project manager)
- `60001002` 王老總 (general foreman)
- `60001003` 陳工程師 (engineer, main_contractor)
- `60001004` 黃管工 (foreman, main_contractor)
- `60001005` 何判頭 (subcontractor)

Project: DC2026 油塘住宅 [persona-sim], 4 zones (1座/2座/3座/4座)

---

## 0. Install + Launch

- [ ] TestFlight app shows "CK Construction 1.1 (build N)" available — tap Update
- [ ] App launches; no crash on cold start
- [ ] Splash screen shows, then login form
- [ ] Status bar Chinese strings render correctly (zh-HK)

---

## 1. Login as 李 PM (60001001)

- [ ] Type `60001001` + `test1234` → tap 登入
- [ ] Profile loads, sidebar shows "李 PM · 項目經理"
- [ ] BottomNav visible (5 icons on phone, not sidebar)
- [ ] Tap 工地 → DC2026 油塘住宅 project visible
- [ ] Tap DC2026 → progress tree shows all 4 zones (老總/PM/admin only)

### PM features
- [ ] In 3座 tap 加大項 → 「污水管 R5」 with peer-apply 1/2/4座 → 4 rows created
- [ ] Tap each new 大項 → verify `[1座]` / `[2座]` / `[3座]` / `[4座]` chip beside title
- [ ] 加聯絡人 → add 黃師傅 (燒焊) 99887766 → row appears
- [ ] 行事曆 → planned arrivals visible; 完工 entries show `[N座]` prefix where in range

---

## 2. Login as 黃管工 foreman (60001004) — MOBILE-CRITICAL

Sign out PM, login 60001004.

### Visibility (R1 fix)
- [ ] Progress tab — only your assigned items visible (3 items in 1座)
- [ ] No items from 2/3/4座

### Daily log — U1 storage button fix (round 1 P0)
- [ ] Tap 每日日誌 → 填寫今日日誌
- [ ] Pick 天氣 = 大風
- [ ] Tick 2 items in picker — verify each shows `[1座]` zone chip
- [ ] Add 自由項目 「外牆架已搭好」
- [ ] **Scroll to bottom — 儲存 button sits ABOVE BottomNav (no overlap)**
- [ ] **Tap 儲存 with single thumb — hits first try (no dead zone)**
- [ ] Returns to daily list, your entry visible

### Slider tap target — C4 fix
- [ ] Tap one item → 更新 → 更新進度 modal
- [ ] **Slider has 48px hit area** (taller than before)
- [ ] **4 quick chips: 25% / 50% / 75% / 100%** below slider
- [ ] Tap 75% chip → value jumps to 75 instantly
- [ ] Tap 100% chip → 100, status → 完成
- [ ] 儲存

### Material request 急件 toggle — C6 fix
- [ ] Tap 物料 → 加物料 (+ floating button)
- [ ] Fill: 物料名 焊條, 單位 包, 數量 5, 預計到貨 (now+4h)
- [ ] **Toggle 急件 ON** — red button "急件 ✓"
- [ ] 用於進度項目 picker shows only your items with `[1座]` chip
- [ ] 提交
- [ ] Returns to list — your 焊條 at TOP with red 急件 chip + zone

### Blocked actions (RBAC verify)
- [ ] Try add 大項 — button hidden (no 加大項 visible)
- [ ] Try add 聯絡人 — blocked (no add button for foreman)
- [ ] Open someone else's item — no 更新 button shown

---

## 3. Login as 何判頭 (60001005)

### Visibility
- [ ] Progress tab — only 水管立管 1座 + 3座 (2 items total)
- [ ] No items from 2/4座

### Sub_role banner — R3 fix
- [ ] Tap 每日日誌 → **amber banner** reads: 「判頭 / 工人唔可以寫日誌 — 由總承建商管工或工程師代為填寫。」
- [ ] No 新增 CTA visible (silent dead-end fixed)

### MaterialItemsPanel mount — D1 fix
- [ ] Tap 水管立管 1座 progress item
- [ ] **`需用物料` panel renders below card** with linked 水管 100mm 逾期 chip
- [ ] Panel shows red 急件 chip if any urgent material linked

### Per-row owner gate — R2 fix
- [ ] Tap 物料 list
- [ ] On YOUR 水管 100mm — 入貨 / 編輯 / 刪除 buttons present
- [ ] On others' materials (鋼筋 / 焊條 / 電線) — **NO mutate buttons** (RBAC gate visible)
- [ ] 逾期 chip visible on 水管 100mm (planned arrival in past)

### Material request urgent
- [ ] Add new 接駁管 10 條 planned 聽日 09:00 with 急件 ON
- [ ] Verify red 急件 chip + sorted to top

---

## 4. Login as 王老總 general_foreman (60001002)

### Supervisor visibility
- [ ] Progress tab — see all 4 zones + all items (22 items total)
- [ ] Calendar 行事曆 — completion entries show `[N座]` prefix

### Add event — v19 fix (老總 was blocked before)
- [ ] 行事曆 → 加事件 → 「結構檢查 v1.1 test」 starts 後日 10:00
- [ ] Event saves successfully (no 403 RLS error)
- [ ] All project members receive push notification (events auto-notify trigger)

### Multi-zone peer-apply
- [ ] In 3座 add 大項 「臨時工程 v1.1」 with peer-apply 1/2/4座
- [ ] All 4 zones receive new 大項 in one action

### Re-assign
- [ ] Tap one foreman item → 指派 button → re-assign to 何判頭
- [ ] 判頭 chip appears in assignee row

---

## 5. Login as 陳工程師 engineer (60001003)

### Calendar zone prefix — U3 fix
- [ ] 行事曆 → 完工 entries show `[1座]` / `[2座]` (not unreadable duplicates)

### Yesterday daily lock message — C5 fix
- [ ] 每日日誌 → 編輯尋日日誌 (if you find a way to trigger)
- [ ] Error toast reads "尋日嘅日誌已鎖，唔可以再改。" (readable, not empty)

### Material request 急件
- [ ] Add 混凝土 5 立方米 聽日 10:00 with 急件 ON
- [ ] Sorted top with red 急件 chip

---

## 6. SECURITY validation — DO NOT need to perform; backend tested

Reference only. R4 prod attack matrix confirmed all 25 vectors hold:

- ✅ Self-promote to admin → BLOCKED (v17 trigger reverts)
- ✅ Edit own company → BLOCKED (v19 trigger reverts)
- ✅ Edit other user's materials → BLOCKED (v16 RLS filter)
- ✅ Read 9 legacy tables → BLOCKED (v18 admin-only)
- ✅ Edit cross-project contacts/events → BLOCKED (v18 assigned-PM gate)
- ✅ Spoof reporter_id on issues → BLOCKED
- ✅ Self-elevate role in project_members → BLOCKED
- ✅ Admin RPC probing → BLOCKED (admin-only)

---

## 7. Account deletion — v20 Apple compliance

- [ ] Profile → 刪除帳戶
- [ ] Confirm dialog
- [ ] Account deleted, app returns to login
- [ ] Try login with same phone → "未註冊" (account gone)
- [ ] No HTTP 409 FK error (v20 SET NULL on 17 FKs)

---

## 8. Cross-tab is N/A on iOS (single webview)

Tab bleed fix only matters for web. Native app = single webview = no tabs.

---

## 9. Report back

For each ❌ failure:
- Step number
- What you saw vs expected
- Screenshot if visual

For each ✅ pass:
- Just check the box

Done = ready to promote TestFlight → App Store production via `ios-app-store` workflow.
