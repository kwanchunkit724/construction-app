# Session Summary — what's done + your follow-ups

## ✅ DONE (by me, shipped to main + prod)

### 1. iOS / Android 同步
- Every last-night change lives in `src/` (→ dist → `cap sync` → native) or Supabase (all platforms). Nothing web-only.
- Codemagic `ios-testflight` + `android-internal-test` **both auto-build on every push to main**, version **1.3**. Bundle-size gate passes (教學 data lazy-split). So iOS(TestFlight)+Android(internal) 1.3 builds already carry everything.

### 2. Simulation (real-workflow) → 7 bugs found → ALL fixed + re-tested
- **P0** PTW QR was completely dead (`mint_ptw_jwt` never granted) → **v34 grant**, applied+verified on prod.
- **P1** 行事曆 leaked every progress item to assigned-only workers → **v34** narrowed visibility.
- **P1** delegated worker's progress saved but audit-history was silently denied → **v34** new policy (+ client logs it).
- **P1** 老總 saw 加物料 but INSERT rejected → **v34** added general_foreman to materials insert.
- **P1** project status tiles used frozen status (contradicted cards) → derive live (client).
- **P2** PM/handler couldn't reopen a resolved issue → gate on (reporter OR handler).
- **P2** no way to edit an item's title/dates without delete+recreate → **新增 編輯 功能** (updateItemMeta + EditItemModal).
- v34 verified on prod: `mint_ptw_grant=true, hist_policy=1, materials_gf=true, timetable_narrowed=true`.

### 3. /sell up to date
- v1.1 → **v1.3** (3 places); founding-price deadline 2026-06-30 → **2026-08-31**; PTW types fixed to 動火/高空/吊運; store-status bullets corrected (Apple live·v1.3; Google Play 寫實 = 上架審批中).

### 4. SQL editor
- I now drive the Supabase SQL editor + press Run myself (used it to apply + verify v34). No more "you run it".

### 5. Google Play 上架 — researched + planned (see `.planning/playstore/PLAY-STORE-上架.md`)
- Recommend **Organization account** (skips the 12-tester/14-day gate) — needs a **D-U-N-S number (~30 working days HK, start now)**.
- I can do: upload-keystore wiring, AAB build, listing assets + zh-HK copy, draft Data-Safety/rating answers.

### Commits this session (latest first)
`1237b13` sim client fixes · `v34` backend (prod) · `eec2194` /sell refresh · playstore plan · `666c0f1`/`53d9712` 教學 · `baaac0e` applicant-RPC fix · …

---

## ⚠️ YOUR FOLLOW-UPS

### A. Google Play 上架 (biggest — start the long pole today)
1. **Decide Organization vs Personal** (permanent). Org recommended.
2. **(Org) request a D-U-N-S number** from D&B Hong Kong now (~30 working days, free) — this is the critical-path wait.
3. Complete **identity verification** in Play Console (currently the blocker) + pay the US$25 fee.
4. Tell me when ready → I generate the keystore wiring + build the production AAB + prepare the listing.
5. **14-day trigger**: only exists on the Personal path. If you go Personal, tell me the day you start closed testing (≥12 testers installed) and I'll schedule the 14-day reminder + draft the production-access answers. On the Org path there's no such trigger.

### B. iOS App Store
- 1.2 is "Waiting for Review"; 1.3 builds are on TestFlight with all fixes. Decide: wait for 1.2 to approve, or submit 1.3 to replace it. (I can drive the submission.)

### C. Nothing else to run
- All migrations (v26–v34) are applied + verified on prod. I have SQL-editor access now.

### D. Optional polish (non-blocking)
- App Store screenshots still show the older 進度表; /sell could add a dedicated 教學 workflow-diagram showcase section. Say the word.
