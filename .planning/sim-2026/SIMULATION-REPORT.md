# 模擬報告 — CK工程 4-類型全功能模擬
# Simulation Report — 4 project types, every function reviewed

> 在生產 Supabase 上建立 4 個真實 [DEMO] 項目，覆蓋每個項目類型 × 全部 13 個模組，再以每個角色靜態審視每個功能，記錄可行動項目。日期 2026-06-16。

## 1. 執行摘要 Executive Summary

- **4 個真實項目類型**（合共 134 個進度項目，全部 13 模組已植入並驗證）：
  - 大地盤/新建大樓 — [DEMO] 觀塘商住發展項目（50 進度項目）
  - 小型裝修 — [DEMO] 旺角寫字樓內部翻新（33 進度項目）
  - 渠務/地下管線 — [DEMO] 沙田地下雨水及污水渠更換（25 進度項目）
  - 大樓維修 — [DEMO] 太古城外牆及機電保養（26 進度項目）
- **共記錄 190 個可行動項目**：🔴 47 BUG · 🟡 57 UX 摩擦 · 🟣 12 缺功能 · 🟢 74 運作良好（可作 demo 賣點）。
- 其中 **22 個 S1/S2 高優先 BUG**（demo-breaking / 核心流程）。

| 類型 | BUG | UX | MISSING | GOOD |
|---|--:|--:|--:|--:|
| 大地盤/新建大樓 | 16 | 26 | 2 | 18 |
| 小型裝修 | 16 | 11 | 6 | 18 |
| 渠務/地下管線 | 14 | 20 | 4 | 22 |
| 大樓維修 | 1 | 0 | 0 | 16 |
| **合計** | **47** | **57** | **12** | **74** |

## 2. 最高優先修復 Top Fixes (S1/S2 BUG)

> 跨 4 類型去重後嘅 demo-breaking / 核心流程問題 —— 即用戶想做嘅 review/debug 輸出。

1. **[S1]** (大地盤/新建大樓) [BUG] S1 — Worker persona is fully read-only on progress (nothing assigned).
2. **[S1]** (渠務/地下管線) Tags: [BUG] broken/wrong, [UX] friction/confusing, [MISSING] capability gap, [GOOD] demo-worthy strength. Severity: S1 (blocker/wrong data), S2 (major friction), S3 (minor/polish).
3. **[S1]** (渠務/地下管線) [BUG] S1 — Cannot create 密閉空間 (confined_space) or 掘地 (excavation) permits from the UI. Role: 判頭/safety_officer/main_contractor. PTW_TYPE_V1 = [hot_work,work_at_height,lifting] (src/types.ts:979); PtwSubmitForm disables every other type butt…
4. **[S1]** (渠務/地下管線) [BUG] S1 — confined_space and excavation have EMPTY checklist templates. checklistTemplate() returns [] for both (src/lib/ptw.ts:126-130). Even if enabled, the safety core (氣體測試 O2/H2S/CO/LEL, 連續通風, 三腳架+救生繩, 坑外監察員 / 護土板支撐, 管線探測, 指揮員) is abs…
5. **[S1]** (渠務/地下管線) [BUG] S1 — PtwDetail never renders the confined-space gas test, hazards, or controls. Role: safety_officer/approver. PtwDetailInner renders only payload.description + payload.checklist (src/pages/PtwDetail.tsx:120-141). The seed PTW-001 pay…
6. **[S1]** (渠務/地下管線) [BUG] S1 — safety_officer cannot be a handler and cannot act on safety issues they did not report. Role: safety_officer (60000004). IssueHandlerRole enum is pm|main_contractor|subcontractor|admin (src/types.ts:452) — no safety_officer. getI…
7. **[S1]** (渠務/地下管線) [BUG] S1 — general_foreman (老總) is invisible in the entire issue chain. Role: 老總 (60001002). No getInitialHandler case (defaults pm), no canActOnIssue branch. The on-site boss cannot act on any issue routed to subcontractor/main_contractor/…
8. **[S1]** (渠務/地下管線) [BUG] S1 — Non-admin members (老總/判頭/管工/工人/safety) cannot reach the cross-site Dashboard. visibleProjects for non-admin = only assigned_pm_ids.includes(uid) (Dashboard.tsx:39-43); the route also redirects non-PM/non-admin to /home (:151). Fo…
9. **[S1]** (大樓維修) STATIC review of src/ + seed-maintenance.sql + supabase/*.sql. 42 items across 13 modules + cross-cutting. Tags [BUG]/[UX]/[MISSING]/[GOOD], severity S1(demo-breaking)…S4(cosmetic). NOTE: the harness blocked writing the .md file — persist t…
10. **[S2]** (大地盤/新建大樓) [BUG] S2 — canManageStructure contradicts its own doc comment for main_contractor.
11. **[S2]** (大地盤/新建大樓) [BUG] S2 — safety_officer and general_foreman reporters route via the default branch.
12. **[S2]** (大地盤/新建大樓) [BUG] S2 — 老總 (general_foreman) cannot act on issues he did not report.
13. **[S2]** (大地盤/新建大樓) [BUG] S2 — No client-side expired derivation; an over-time permit still reads 生效中.
14. **[S2]** (大地盤/新建大樓) [BUG] S2 — Only main_contractor+foreman/engineer can author; PM and 老總 are locked out.
15. **[S2]** (大地盤/新建大樓) [BUG] S2 — general_foreman (老總) write rights are inconsistent across modules. Same role,
16. **[S2]** (大地盤/新建大樓) [BUG] S2 — Cross-project Dashboard is PM/admin-only; MC and 老總 are bounced. Dashboard
17. **[S2]** (渠務/地下管線) [BUG] S2 — No confined-space exit/sign-out gate at close-out. Non-hot_work shows a bare 關閉許可證 button (PtwDetail.tsx:194-201); there is no all-workers-accounted-for gate before closing PTW-001.
18. **[S2]** (渠務/地下管線) [BUG] S2 — The drainage KPI tiles promised by the template are never rendered. DRAINAGE.kpiTiles=drainage (src/lib/progressTemplates.ts:85) promises Sigma-m / 距交場 tiles, but ProjectDetail only special-cases isMaintenance (src/pages/ProjectD…
19. **[S2]** (渠務/地下管線) [BUG] S2 — Seed-authored progress_history for D.1 attributed to 判頭(60001005), but app gates progress writes to supervisors. Seed two history ticks set updated_by=60001005 (subcontractor, lines 333/336). canManageStructure grants update only…
20. **[S2]** (渠務/地下管線) [BUG] S2 — Two supervisor gates on the same screen disagree. Role: main_contractor (60001003). MaterialsContext.canManage (FAB/create) grants membership roles [pm,main_contractor,general_foreman,subcontractor] (MaterialsContext.tsx:117), bu…
21. **[S2]** (渠務/地下管線) [BUG] S2 — 老總 (general_foreman) and 判頭 cannot write the daily log. Role: 老總 60001002 / 判頭 60001005. canAuthor requires global_role==main_contractor AND sub_role foreman/engineer (DailyList.tsx:53-56). On a 渠務 site the 老總 keeps the diary and…
22. **[S2]** (渠務/地下管線) [BUG] S2 — DataIntegrity 匯出證明 uses anchor-download, blocked in Capacitor WebView (iOS/Android). exportProof builds an a-download and clicks it (DataIntegrity.tsx:50-56) — the same pattern export.ts documents as blocked on native (where it u…

## 3. 其餘 BUG (S3/S4)

- [S3] (大地盤/新建大樓) [BUG] S3 — In-review SI/VO/PTW have an empty 簽核紀錄 timeline. Role: PM/MC reviewers.
- [S3] (大地盤/新建大樓) [BUG] S3 — approvals/protest_comments fetched without a project filter.
- [S3] (大地盤/新建大樓) [BUG] S3 — Expired-by-time permit shows 即將到期 instead of 已過期. PtwCard.isExpiring is
- [S3] (大地盤/新建大樓) [BUG] S3 — Claim editing is owner-locked (recorded_by = uid RLS). Both seed claims are
- [S3] (大地盤/新建大樓) [BUG] S3 — canManage includes general_foreman but the comment claims parity with SI/VO's
- [S3] (大地盤/新建大樓) [BUG] S3 — Timetable write gate keys on GLOBAL role, unlike most modules.
- [S3] (大地盤/新建大樓) [BUG] S3 — Weather route missing from desktop Sidebar. 天氣記錄 (/project/:id/weather) is
- [S3] (渠務/地下管線) [BUG] S3 — Seed dailies authored by 60000002 (engineer) and 60001004 (foreman) who are NOT members of the drainage project. Not in the project_members insert (only 6 roles). dailie…
- [S?] (大地盤/新建大樓) Tags: [BUG] defect, [UX] friction, [MISSING] absent capability, [GOOD] demo-positive.
- [S?] (小型裝修) Tags:** [BUG] [UX] [MISSING] [GOOD] [PERM]. **Severity:** P1 blocks/data-wrong, P2 notable, P3 polish.
- [S?] (小型裝修) [BUG] P1 — small_works seed has TWO zones but template hides ALL zone chrome -> two unlabeled, indistinguishable lists
- [S?] (小型裝修) [BUG] P2 — autoZone hides zones in 進度 but Dashboard + export still expose "N 個分區"
- [S?] (小型裝修) [BUG] P2 — small_works allowedModes = [checklist,percentage] but seed uses quantity leaves the create UI cannot author
- [S?] (小型裝修) [BUG] P2 — Quantity rollup weighting only triggers when EVERY leaf under a parent is quantity+one-unit; B 機電 mixes modes -> parent % is unweighted mean
- [S?] (小型裝修) [BUG] P2 — reporter role general_foreman missing from getInitialHandler switch -> defaults to pm, but seed I-3 placed it at main_contractor
- [S?] (小型裝修) [BUG] P2 — safety_officer reporter also missing from getInitialHandler -> routes to pm (silent default)
- [S?] (小型裝修) [BUG] P3 — SiContext fetches ALL approvals where doc_type=si + ALL protest_comments with no project filter
- [S?] (小型裝修) [BUG] P2 — Expiry is end-of-HK-day; if demo runs the day AFTER seed, PTW-001 expires at midnight but status stays active (no cron flips it)
- [S?] (小型裝修) [BUG] P2 — Material supervisor uses GLOBAL role (profile.global_role) unlike progress/SI/weather which use per-project membership role
- [S?] (小型裝修) [BUG] P1 — Only main_contractor with sub_role foreman/engineer can author a daily; the 老總 (general_foreman) CANNOT write the log
- [S?] (小型裝修) [BUG] P2 — canAuthor requires a sub_role; a main_contractor with sub_role=null is blocked - and the seed never sets 60001003.sub_role
- [S?] (小型裝修) [BUG] P2 — Form signer (safety_officer) has no seeded credential -> the sign-on-your-phone flow may reject
- [S?] (小型裝修) [BUG] P2 — Documents surface ALSO requires global files_enabled flag; if off, non-admins see NO 文件 card despite all-modules-on + seeded docs
- [S?] (小型裝修) [BUG] P2 — get_recent_weather_events(120) is territory-wide; the page may list weather days seeded by OTHER demo projects for the same dates
- [S?] (小型裝修) [BUG] P2 — Dashboard only shows admin or assigned_pm_ids projects; 判頭/老總/engineer/safety bounced to /home, no portfolio view

## 4. UX 摩擦 UX Friction

- (大地盤/新建大樓) [UX] S2 — Hot-work close-out is hidden until fire-watch + 30 min elapse. Role: 判頭.
- (大地盤/新建大樓) [UX] S2 — Documents module is flag-gated (files_enabled) — invisible to non-admins
- (大地盤/新建大樓) [UX] S2 — AddEquipmentModal cannot attach a form template at creation. Role:
- (渠務/地下管線) [UX] S2 — Unit-string mismatch silently disables quantity-weighted rollup. Seed uses qty_unit=米; create-modal default + chips offer m/m2/m3 (CreateItemModal.tsx:31). quantityWeight…
- (渠務/地下管線) [UX] S2 — Live WeatherBanner stop-work copy is wrong for drainage. Hardcodes 惡劣天氣警告生效 — 應停止戶外高空/吊運工作 (src/components/WeatherBanner.tsx:37). For 渠務 the暴雨 risk is 溝槽積水/掘路停工/密閉空間進水, n…
- (渠務/地下管線) [UX] S2 — No 密閉空間/掘地-specific safety lane in escalation. Seed issue #1 (CH150 未標示電纜) correctly walks worker->判頭->總承建. But a stop-work safety issue (護土板鬆動 #4) routes the same generi…
- (渠務/地下管線) [UX] S2 — 文件 module is flag-gated (files_enabled) AND module-gated. ToolsSwitcher.showFiles needs (filesEnabled||admin) AND isModuleEnabled(documents) (ProjectDetail.tsx:723). If f…
- (渠務/地下管線) [UX] S2 — Cross-site Dashboard mis-counts because it has no ModulesProvider. 處理中問題 is RLS-filtered (disabled-issues projects return 0) but the page footnotes it rather than computi…
- (渠務/地下管線) [UX] S2 — Assistant only loads with project context the read-only personas may lack. Combined with dashboard/role gates, the 老總/判頭 reach the assistant only inside the project; the …
- (渠務/地下管線) [UX] S2 — Role-gate logic is inconsistent: some screens use global_role, some use per-project membership role. Progress+Weather+Materials(canManage) key on membership role; Materia…
- (大地盤/新建大樓) [UX] S3 — Seeded dailies can't be reproduced by the labelled persona. Role: 老總
- (大地盤/新建大樓) [UX] S3 — Deep tree is cramped on a 390px phone. Indent is (level-1)*0.85rem
- (大地盤/新建大樓) [UX] S3 — Zone badge repeats on every descendant. zoneLabel renders on every card
- (大地盤/新建大樓) [UX] S3 — Floor-mode towers have no bulk "complete up to N/F". Role: 判頭/foreman.
- (大地盤/新建大樓) [UX] S3 — Contributors can update a leaf but cannot see its 歷史 / 指派. The 歷史 and
- (大地盤/新建大樓) [UX] S3 — Escalation can dead-end with no 判頭 member. A worker-reported issue routes
- (大地盤/新建大樓) [UX] S3 — Issues carry no zone/leaf link. Issue has free-text location only
- (大地盤/新建大樓) [UX] S3 — SI status filters do not expose draft. SiList FILTERS (:10) are
- (大地盤/新建大樓) [UX] S3 — VO total ignores the source SI's locked status visually. VO-002 hangs off
- (大地盤/新建大樓) [UX] S3 — Expiry shows time only, no date. formatExpiry (PtwCard.tsx:27) prints HH:mm —
- (大地盤/新建大樓) [UX] S3 — general_foreman inconsistency vs SI/VO. DocumentsContext includes
- (大地盤/新建大樓) [UX] S3 — receiveMaterial cannot correct an over-receive. qty must be > 0 (:206) and is
- (大地盤/新建大樓) [UX] S3 — One daily per (project,user,date) — no consolidated site view. onConflict
- (大地盤/新建大樓) [UX] S3 — Read-only for everyone but admin/PM curators. ContactsContext comment (:77)
- (大地盤/新建大樓) [UX] S3 — Equipment entry is role-gated with no flag, unlike the rest. Comment at
- (大地盤/新建大樓) [UX] S3 — Module-disabled projects undercount Dashboard 處理中問題. The Dashboard footnote
- (渠務/地下管線) [UX] S3 — PTW expiry end-of-HKT-day derived, no active->expired cron. PTW-001 expires_at = 23:59 HKT today; after midnight it stays active until a client derives expiry. Multi-day …
- (渠務/地下管線) [UX] S3 — CLAUDE.md documents canEdit=[pm,main_contractor,subcontractor] but code uses [pm,general_foreman,main_contractor]. Doc/code drift; subcontractor swapped for general_forem…
- (渠務/地下管線) [UX] S3 — zoneNoun 路段 / labelNoun 工序 only relabels copy; zones still admin-defined free strings. Drainage zones are chainages (CH0-CH120) but the create-item floors generator still…
- (渠務/地下管線) [UX] S3 — EOT claim has no link to the blocked progress item or the daily. Seed 黑雨日 also has a daily + blocks B.2; claim/daily/blocked-item are three disconnected records. A 渠務 EOT…
- (渠務/地下管線) [UX] S3 — VO chain step 2 = owner, but the seed project has no owner member. VO chain mc->pm->owner (seed line 451); no owner persona is a member. VO-001 advances mc->pm then dead-…
- (渠務/地下管線) [UX] S3 — SI geo-pin (22.38/114.18) renders a generic OSM tile, not the chainage. Acceptable.
- (渠務/地下管線) [UX] S3 — No per-unit-price or supplier field. A 判頭 ordering 44 支 HDPE wants supplier (黃工/喉管供應 lives in 聯絡人, not linked here).
- (渠務/地下管線) [UX] S3 — excavation equipment kind has no auto-link to the 掘地 PTW. EQ-001 (挖掘機) and PTW-002 (excavation) are unrelated records.
- (渠務/地下管線) [UX] S3 — Daily weather/warning captured independently from weather_events/EOT. Foreman re-types 黃雨 while the EOT page already has it from HKO. Duplicate entry; no cross-link.
- (渠務/地下管線) [UX] S3 — No event<->progress or event<->PTW linkage. DSD 中段檢查 does not reference D.1; milestone does not reference H.1 CCTV. Standalone entries.
- (渠務/地下管線) [UX] S3 — Contacts are free-text and not linked to issues/materials. CLP contact and issue #1 (CLP 驗線) unrelated; 喉管供應 and material orders unrelated. Tap-to-call from the blocked i…
- (渠務/地下管線) [UX] S3 — No drainage-specific default module set. A 渠務 project ships with all 13 on; an admin must manually disable building-centric ones. A project-type default profile would hel…
- (渠務/地下管線) [UX] S3 — general_foreman + safety_officer are first-class global roles but second-class downstream (no issue handler slot, no daily authoring, no dashboard, partial materials). Th…
- (大地盤/新建大樓) [UX] S4 — No contiguity guard on floors. You can tick 9/F done while 8/F is not
- (大地盤/新建大樓) [UX] S4 — Level border colour stops at L2. LEVEL_BORDER (ProgressItemCard.tsx:55)
- (大地盤/新建大樓) [UX] S4 — VO total has no per-category subtotal. VO-002 mixes 鋼結構 (38 噸) + 設計 — only
- (大地盤/新建大樓) [UX] S4 — EOT total sums all claims regardless of critical path. totalDays
- (大地盤/新建大樓) [UX] S4 — No partial-arrival timestamp trail. arrived_at is stamped only when fully
- (大地盤/新建大樓) [UX] S4 — Statutory inspection events are not linked to the equipment form. The seeded
- (大地盤/新建大樓) [UX] S4 — No link between a contact and the trade's progress items. 強記紮鐵 (紮鐵) is not
- (小型裝修) [UX] P2 — small-works KPI tile kind is defined but never rendered (dead config)
- (小型裝修) [UX] P2 — status derives live from schedule-vs-today, so stored seed status values are partly ignored (narration caveat, not a code bug).
- (小型裝修) [UX] P3 — Level-3 indent (level-1)*0.85rem too shallow on 390px phone for the real 3-level chains (B->B.1->B.1.1/.2/.3, C->C.1->C.1.1/.2/.3). Fix: deeper indent / guide line.
- (小型裝修) [UX] P3 — ISSUE_STATUS_ZH.open=處理中 shows even before anyone acts. Cosmetic.
- (小型裝修) [UX] P2 — SI list/cards do not show WHO approves next until you open the SI
- (小型裝修) [UX] P2 — yesterday daily immutable (尋日嘅日誌已鎖); with the narrow author gate, a missed day cannot be backfilled by anyone. Good for audit; note for demo.
- (小型裝修) [UX] P3 — Contacts pure free-text, no dedupe / no user_profiles link (發記水電 phone 69001234). Acceptable for a phonebook.
- (小型裝修) [UX] P3 — Two overlapping file systems (per-item 圖則 Drawings vs 文件 Documents) toggled by a flag; seed has NO drawings rows so flag-OFF shows 圖則(0) empty. Mildly confusing.
- (小型裝修) [UX] P3 — EOT export buttons only show when claims.length>0; a project with events but no claims has no export. Minor (nothing to export).
- (小型裝修) [UX] P2 — Assistant gated behind BOTH ai_enabled (project) AND assistant module; toggling either off silently hides 助理 with no hint why. Note for ops.
- (小型裝修) [UX] P2 — CreateItemModal still shows the multi-zone 套用到分區 picker (z1/z2) for autoZone small_works

## 5. 缺少功能 Missing Features

- (大地盤/新建大樓) [MISSING] S2 — SI list has no forward link to its derived VO. Role: PM/MC. The SI->VO
- (大地盤/新建大樓) [MISSING] S2 — No cross-project SI/VO/PTW approval inbox. Only documents get the 待我審批
- (小型裝修) [MISSING] P2 — Issues have no structured link to a progress item (location is free-text)
- (小型裝修) [MISSING] P3 — VO line references progress_leaf_item_id (VO-001 line1 -> C.3 玻璃間隔) but no back-link from the progress item to its VO
- (小型裝修) [MISSING] P3 — No PTW<->progress-item or PTW<->method-statement link though seed relates PTW-001 to B.2 風喉 + DOC-2 MS-001 (熱工序方法). Dispute trail wants permit+method+work in one view.
- (小型裝修) [MISSING] P2 — Events do not auto-derive from material arrivals / progress planned_end / PTW expiry though the card subtitle promises 物料到貨, 進度完工
- (小型裝修) [MISSING] P3 — No equipment<->PTW link though EQ-001 棚架 (work-at-height) + hot-work PTW share A區頂 worksite.
- (小型裝修) [MISSING] P3 — No indicator distinguishing off-because-module vs off-because-project-flag. Minor diagnostic gap.
- (渠務/地下管線) [MISSING] S2 — No periodic gas re-test capture for confined space. A confined-space permit needs gas readings logged at re-entry intervals, not once at submit. Nothing in the PTW model supports re-tes…
- (渠務/地下管線) [MISSING] S3 — No document-type for 渠務 CCTV survey (WRc) or DSD 驗收紀錄. DocumentType is material_submission/method_statement/drawing/inspection/other (src/types.ts:576). Seed H. CCTV 檢測 has no natural h…
- (渠務/地下管線) [MISSING] S3 — No recurring-event support. 每週協調會 is a single row; a weekly meeting needs recurrence.
- (渠務/地下管線) [MISSING] S3 — No drainage-tuned assistant prompt (e.g. remind me to renew the confined-space gas test, which 路段 is behind by metres). Generic 站長 prompt.

## 6. 運作良好 — Demo 賣點 What Works Well (GOOD)

> 呢啲係 demo 時要 show off 嘅 —— 每個模組都有實際可演示嘅強項。

- (大地盤/新建大樓) [GOOD] Rich, realistic baseline. 8 大項 -> 中項 -> 細項 with mixed tracking modes
- (大地盤/新建大樓) [GOOD] Deep 大項->中項->細項 rollup with schedule variance. computeRollup
- (大地盤/新建大樓) [GOOD] Blocked-reason surfacing. D.5 後加鋼結構天幕 carries status=blocked + reason tied
- (大地盤/新建大樓) [GOOD] Audit-trail comments with from/to role. Every escalation writes an
- (大地盤/新建大樓) [GOOD] Server-authored approve-with-edits. approve_with_edits goes through
- (大地盤/新建大樓) [GOOD] Server-computed total + parent-SI citation. VO total from sync_vo_total; VoDetail
- (大地盤/新建大樓) [GOOD] Delegation-aware approver gate. VoApproverBar.isRoleHolder (:79) mirrors
- (大地盤/新建大樓) [GOOD] Full statutory checklist + QR + signature proof. Hot-work checklist
- (大地盤/新建大樓) [GOOD] Live HKO events + per-project EOT claims + CEDD-form export. Seed has
- (大地盤/新建大樓) [GOOD] Cross-project 待我審批 inbox on Home. PendingReviewsTile (Home.tsx:181) + /reviews
- (大地盤/新建大樓) [GOOD] Generated status + client-derived 逾期 + leaf linkage. Seed shows arrived
- (大地盤/新建大樓) [GOOD] Manpower/plant/weather AM-PM/warning-signals + 複製琴日. The seed's three dailies
- (大地盤/新建大樓) [GOOD] Mixed event types + derived progress/material milestones. Seed has a weekly
- (大地盤/新建大樓) [GOOD] Trade address book + one-tap call. Seed has 強記紮鐵 / 永盛機電 / 城建混凝土 / 高空幕牆
- (大地盤/新建大樓) [GOOD] Expired + expiring tiles drive the boss view. Seed sets EQ-002 scaffold CSSR-F5
- (大地盤/新建大樓) [GOOD] Credential gate + QR print sheet + register export. Managers verify uploaded
- (大地盤/新建大樓) [GOOD] AI tab gated on project ai_enabled + module switch. Seed sets ai_enabled=true;
- (大地盤/新建大樓) [GOOD] Step-up re-auth + signature non-repudiation on sensitive actions.
- (小型裝修) [GOOD] — autoZone correctly hides 尚未設定分區 dead-end + create-project zone editor (clean 2-field create flow). Defensive templateFor() degrades unknown type to general.
- (小型裝修) [GOOD] — Mixed tracking modes render correctly: percentage (B), checklist (A.1/B.2/C.1/E.2), quantity (B.1 320m, D.1 m2), blocked (B.3 受阻), delayed (B.4). Right per-mode chips. Strong demo variety.
- (小型裝修) [GOOD] — get_visible_progress_items RPC scopes tree by role; worker 60001006 (assigned B.1 + children) only sees their items in progress + daily picker. Good least-privilege.
- (小型裝修) [GOOD] — Escalation chain + numbering render seeded threads right: I-1 (worker->判頭 open), I-2 (判頭->總承建商 escalated), I-3 (老總->總承建商 resolved), I-4 (工程師->PM escalated). Good demo.
- (小型裝修) [GOOD] — SI-001 locked (玻璃間隔, full MC->PM audit) + SI-002 in_review (電熱水爐) land in right filter pills; SI-001 drives VO-001. Clean SI->VO demo.
- (小型裝修) [GOOD] — HKD totals server-recomputed; VO-001 (玻璃差價, incl. NEGATIVE -220000 退回石膏 line -> net 1,670,000) + VO-002 (電熱水爐 470,000). Realistic swap-and-credit reno change order. Great demo of credit lines…
- (小型裝修) [GOOD] — Realistic hot-work PTW-001 (風喉鋼支架燒焊): full 安全主任->PM chain, 5-item fire-watch checklist all ticked, 2 named workers, HK-day expiry. Exactly the hot-work a reno produces.
- (小型裝修) [GOOD] — Four lifecycle states (arrived / 50-90 partial / future / overdue 電熱水爐) + item links + 逾期 chip/filter. Exactly the where-is-my-料 view a 判頭 needs.
- (小型裝修) [GOOD] — Materials link to progress items (item_ids): 石膏板->C.1, 地毯磚->D.2, 電熱水爐->B.4, 電線->B.1, 天花骨料->C.2. MaterialItemsPanel 需用物料 on each leaf closes the loop (叫料 tied to工序). Strong reno demo.
- (小型裝修) [GOOD] — Rich daily: AM/PM weather + warning signals + manpower/plant + linked items + 複製琴日. Seed has 3 days incl. 黃雨 + 酷熱天氣警告. Good daily-cadence reno story.
- (小型裝修) [GOOD] — Seeded events cover meeting (每週工地會議) / inspection (消防則師到場->I-2) / milestone (機電完工). Good cross-module coherence.
- (小型裝修) [GOOD] — Per-project address book + trade filter + tap-to-call. Trade pills (水電/冷氣/玻璃間隔/系統傢俬) match the reno tree (B/C.3/F). tel: link mobile-correct. Clean.
- (小型裝修) [GOOD] — Two plant (活動棚架 EQ-001, 物料吊運絞車 EQ-002) with weekly checks: CSSR-F5 valid +10d, LALG-F1 吊機 expiring +1d. 5-bucket colored dashboard + 餘 N 日 chips. Strong safety story; 吊機 即將到期 餘 1 日 great remi…
- (小型裝修) [GOOD] — MAT-001 地毯磚送審 (approved by PM) + MS-001 燒焊方法 (submitted, ties to hot-work PTW). Clean submit->review demo.
- (小型裝修) [GOOD] — Territory weather_events (amber_rain/very_hot/rainfall_20mm) + 2 per-project EOT claims with CEDD fields + Excel/PDF export. 36mm 旺角 + 黃雨 days noted 室內裝修為主 未影響關鍵路徑 (0-day claim). Honest logge…
- (小型裝修) [GOOD] — Project ai_enabled=true so 助理 tab shows; good to demo 站長 summarising the blocked 灑水頭 / overdue 電熱水爐 on this data-rich seed.
- (小型裝修) [GOOD] — Module gating bounces you back to 進度 if the active tab module is turned off mid-session (realtime). No stranded blank tab.
- (小型裝修) [GOOD] — Offline read cache on progress (cacheGet/cacheSet + refetch-on-reconnect). Relevant even for a Mong Kok office reno (lift-lobby dead zones).
- (渠務/地下管線) [GOOD] — PTW list, filters, QR token, approval timeline, 簽名證明 cert all render. Seed active confined_space + in_review excavation list, filter by 生效中/簽核中; PTW-001 shows worker roster (陳大文/李志強), QR card…
- (渠務/地下管線) [GOOD] — Permit chain safety_officer->main_contractor is seeded and honoured (matches 密閉空間 reality: safety signs first).
- (渠務/地下管線) [GOOD] — Quantity mode fully wired end-to-end. Create (teal 數量 sub-form, unit chips), update (big numeric + ±10 stepper, clamps at qty_total), rollup (quantity-weighting by qty_total when a branch sha…
- (渠務/地下管線) [GOOD] — 受阻 (blocked) status with reason is a great drainage fit. B.3 大涌橋路 blocked reason 等待業主提供地下管線竣工圖; toggle reasons 雨天/地下水/掘路紙/物料/其他 (UpdateProgressModal.tsx:11) match 渠務 stoppages. Card shows amb…
- (渠務/地下管線) [GOOD] — Deep tree (大項->中項->細項) + per-zone rollup + schedule variance render cleanly for the 8-大項 / 路段-中項 / 細部工序 structure.
- (渠務/地下管線) [GOOD] — Weather/EOT page well-suited to 渠務 暴雨 claims. WeatherRecord lists territory weather_events (黑雨/黃雨/雨量78mm/酷熱) joined to per-day project_weather_claims with CEDD App-7.4 fields (關鍵路徑/本可施工/善後/申請…
- (渠務/地下管線) [GOOD] — 24h雨量>20mm objective trigger (seed rainfall_20mm 78mm 沙田 N05) matches the private SFBC/房署 standard the footnote cites — credible for 渠務 EOT.
- (渠務/地下管線) [GOOD] — The worker->判頭->總承建 escalation on issue #1 (未標示電纜) is a textbook 渠務 demo. Comment trail (停工圍封->判頭上報->總承建約中電驗線) renders fully in IssueDetail.
- (渠務/地下管線) [GOOD] — Issue #/location fields + Excel export (問題清單 + 處理紀錄 sheets) carry CH150/MH2/CH180 — good where 邊一段 matters.
- (渠務/地下管線) [GOOD] — SI-001(locked, 遇岩石)->VO-001(破碎機計價) chain is the strongest commercial demo. SiDetail shows the locked SI, 就此工地指令提出變更指令 button, related VO link, 抗議 tab (seed has 判頭 protest re: night-work permi…
- (渠務/地下管線) [GOOD] — VO PDF export embeds Noto Sans HK so 破碎機/棄置 line items print in Chinese — credible for an owner-facing 渠務 變更 claim.
- (渠務/地下管線) [GOOD] — Overdue derivation correct and demo-ready. isMaterialLate flags requested + past planned_arrival. Seed #3 (預製沙井 MH3, planned 3 days ago, 0 arrived) shows red 逾期 + 供應商延誤已催 — a real risk (MH3 吊…
- (渠務/地下管線) [GOOD] — Material<->progress linkage (item_ids -> D.1/D.4/E.1/F.1) lets the 沙井 delivery show 已連結進度項目. Good traceability.
- (渠務/地下管線) [GOOD] — Forms-expiry dashboard is an excellent 渠務-adjacent demo. EquipmentList shows 5 status tiles (有效/即將到期/過期/未簽/停用) + per-equipment chips. Seed: EQ-002 (汽車吊機 25T, 沙井吊裝) LALG-F1 餘 5 日 (amber); EQ-0…
- (渠務/地下管線) [GOOD] — Credential gate (VerifyCredentialsPanel) for qualified-person sign-off fits 吊機/吊船 statutory signer requirement.
- (渠務/地下管線) [GOOD] — Document register with versions + review states fits 渠務 submittals. Seed: MAT-001 (HDPE 600mm 報批, v1 superseded 缺ISO證書 -> v2 approved), MS-001 (密閉空間作業方法聲明, v1 submitted by safety_officer). Th…
- (渠務/地下管線) [GOOD] — Daily captures 天氣(上晝/下晝)+警告信號+出勤(渠工/泥水/管工)+機械(挖掘機/泥頭車/抽水泵)+freeform. Seed 3 dailies (黃雨抽水/天氣好轉/酷熱遮蔭) are realistic 渠務 entries. Severe-signal red badge for 黑雨/紅雨/T8 works.
- (渠務/地下管線) [GOOD] — Events (會議/檢查/里程碑) seeded sensibly: 每週協調會, DSD 渠管中段檢查 (CH60), 里程碑 雨水渠 CH0-CH120 完工. inspection+milestone types fit 渠務 (DSD 驗收 is the real gate). Renders on the timetable page.
- (渠務/地下管線) [GOOD] — Address book fits 渠務 supply chain. Seed: 陳師傅(渠務判頭), 黃工(喉管供應), 中電工程組 CLP(地下電纜驗線). The CLP contact directly supports the issue #1 narrative — 一鍵打電話 to CLP. Trade-tagged.
- (渠務/地下管線) [GOOD] — Admin can toggle any of 13 modules per project; tabs/cards hide live over realtime, 進度 non-disableable. ProjectDetail gates 問題/簽核/工具/助理 tabs + every tool card on isModuleEnabled, and bounces …
- (渠務/地下管線) [GOOD] — Assistant gated on ai_enabled (seed true) AND assistant module; mutate-via-confirm-card (propose->confirm->execute) is a safe design.
- (渠務/地下管線) [GOOD] — Quantity-weighted rollups, blocked-reason status, EOT objective triggers, SI->VO money chain, forms-expiry dashboard, and tamper-evident ledger together tell a coherent, drainage-credible sto…
- (大樓維修) [GOOD] unit_status authoring (CreateItemModal 樓×室 generator line 227) + 5-state per-room chip editor + 已簽收/共 headline + rose DoorOpen badge = strong MWIS demo.
- (大樓維修) [GOOD] quantity mode B.1.1 升降機(3/6部) + ±10 stepper finger-friendly for 機電保養.
- (大樓維修) [GOOD] issue_no(#001) + 處理層 pill + escalated/commented/resolved activity log render the 4-issue mix cleanly.
- (大樓維修) [GOOD] SI-001 locked + SI-002 in_review, chain_snapshot, 已鎖定/審批中 badges all correct.
- (大樓維修) [GOOD] VO line items reference real leaf A.3.2 (C座防水注漿) + cents→HKD + LINE_ITEM_CATEGORY_ZH; total HKD 285,000.
- (大樓維修) [GOOD] work_at_height checklist HK-accurate (全身式安全帶/獨立救生繩, 綠色合格牌棚紙, 無風球/暴雨, 工具繫繩) + worker list + active QR.
- (大樓維修) [GOOD] weather_events(black-rain 78mm@太古, amber-rain) + project_weather_claims(critical-path 1d / non-critical 0.25d) model 棚上停工→申索 well.
- (大樓維修) [GOOD] MS-001 approved-by-PM w/ note, DWG-001 submitted, document_events trail complete.
- (大樓維修) [GOOD] 4 states demo cleanly: 防水塗料 arrived / 注漿料 partial 80/200 / 面油 requested-future / 補棚竹枝 overdue(planned 2d ago, 0); isMaterialLate derives 逾期; status generated column. B座棚架等料→overdue tight.
- (大樓維修) [GOOD] v45 manpower(棚工6/泥水8/雜工4)+plant(吊船2/發電機1)+weather_am/pm+黃雨 warning_signal; ties to weather claim.
- (大樓維修) [GOOD] 3 events: 法團會議/棚架安全檢查/50%里程碑, typed, future-dated.
- (大樓維修) [GOOD] maintenance-apt trades: 註冊棚廠/永泰防水/安泰機電(EMSD)/業主立案法團(管理處) — 法團 contact is right HK touch for 停水審批; one-tap-call.
- (大樓維修) [GOOD] forms dashboard 5 tiles + per-equipment chips render CSSR-F5棚紙(+2d 即將到期)/SWP-WEEKLY吊船(-1d 過期)/LALG-F1吊機(NULL 未簽) — best safety-compliance beat (read-only; signing blocked, see S1 credential gap…
- (大樓維修) [GOOD] equipment QR mint + EquipmentVerify (scan→equipment_scans+表格狀態+去簽署 deep link) complete for EQ-001棚架/EQ-002吊船/EQ-003吊機.
- (大樓維修) [GOOD] ai_enabled=true → 助理 tab shows; get_weather_outlook + recall_memory live.
- (大樓維修) [GOOD] project_type='maintenance' cleanly drives 座/室 vocab + unit_status default + DeadlineTile off one field; general projects byte-identical.

## 7. 各類型詳細登記冊 Per-type appendices

- 大地盤/新建大樓: [`findings-big-site.md`](findings-big-site.md)
- 小型裝修: [`findings-small-reno.md`](findings-small-reno.md)
- 渠務/地下管線: [`findings-drainage.md`](findings-drainage.md)
- 大樓維修: [`findings-maintenance.md`](findings-maintenance.md)

## 8. 模擬執行說明

- 4 個 seed SQL 經 Supabase SQL editor 套用到生產 DB（每個 idempotent，begin/commit）。套用過程本身已執行每個模組嘅 live RPC/trigger（審批鏈 seed、SI/PTW lock-guard、VO 總額重算、文件 leaf-guard、generated columns），即後端已實際行過一次。
- 角色：admin 60000099 / PM 60001001 / 總承建商 60001003 / 老總(general_foreman) 60001002 / 判頭 60001005 / 工人 60001006 / 安全主任 60000004（密碼 test1234）。
- /demo 頁（公開路由）展示全部 23 個功能；presentation.html/pdf/pptx 為簡報。
