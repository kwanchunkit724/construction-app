# Simulation REVIEW — 渠務 / 地下管線 (drainage) project type

Static, code-level review of the CK 工程 app against the seeded [DEMO] 渠務工程 — 沙田地下雨水及污水渠更換 project (d0000003-…, project_type=drainage, 25 progress items, baseline across all 13 modules). Reviewed by reading src/ + .planning/sim-2026/seed-drainage.sql. No network.

Project context that shapes every finding: linear 路段/沙井 zones (源禾路 CH0-CH260, 大涌橋路, MH1-MH4, 接駁室 BOX-A); quantity (米/m3) progress tracking; 密閉空間 + 掘地 PTW; 暴雨 EOT; SI(岩石開挖)->VO(破碎機) chain; 判頭 lays pipe, 老總(general_foreman) runs site, safety_officer gates 密閉空間.

Tags: [BUG] broken/wrong, [UX] friction/confusing, [MISSING] capability gap, [GOOD] demo-worthy strength. Severity: S1 (blocker/wrong data), S2 (major friction), S3 (minor/polish).

Personas: admin 60000099, PM 60001001, main_contractor 60001003, general_foreman/老總 60001002, subcontractor/判頭 60001005, worker 60001006, safety_officer 60000004.

---

## 1. PTW 工作許可證 (密閉空間 + 掘地) — THE drainage hotspot

- [BUG] S1 — Cannot create 密閉空間 (confined_space) or 掘地 (excavation) permits from the UI. Role: 判頭/safety_officer/main_contractor. PTW_TYPE_V1 = [hot_work,work_at_height,lifting] (src/types.ts:979); PtwSubmitForm disables every other type button with a 敬請期待 label (src/components/ptw/PtwSubmitForm.tsx:152-173). The seed PTW-001 (confined_space, MH2 接駁) and PTW-002 (excavation, 溝槽 deep>2m) only exist because the seed inserts them directly. For a 渠務 site these two ARE the permits — the app cannot create the permit types this project type lives on. Repro: 簽核 -> 工作許可證 -> 新增 -> 密閉空間 and 掘地 greyed 敬請期待. Fix: add both to PTW_TYPE_V1 and ship their checklist templates.
- [BUG] S1 — confined_space and excavation have EMPTY checklist templates. checklistTemplate() returns [] for both (src/lib/ptw.ts:126-130). Even if enabled, the safety core (氣體測試 O2/H2S/CO/LEL, 連續通風, 三腳架+救生繩, 坑外監察員 / 護土板支撐, 管線探測, 指揮員) is absent — the form submits with no safety gate. Seed payloads carry hazards/controls/gas_test (lines 500, 533) with no template to populate them.
- [BUG] S1 — PtwDetail never renders the confined-space gas test, hazards, or controls. Role: safety_officer/approver. PtwDetailInner renders only payload.description + payload.checklist (src/pages/PtwDetail.tsx:120-141). The seed PTW-001 payload {hazards, controls, gas_test:{o2,h2s,co,lel}, valid_from/valid_to} is invisible. The PtwPayload type (src/types.ts:923-932) has no hazards/controls/gas_test/valid_from/valid_to fields, so the model cannot even represent them.
- [MISSING] S2 — No periodic gas re-test capture for confined space. A confined-space permit needs gas readings logged at re-entry intervals, not once at submit. Nothing in the PTW model supports re-test rows.
- [BUG] S2 — No confined-space exit/sign-out gate at close-out. Non-hot_work shows a bare 關閉許可證 button (PtwDetail.tsx:194-201); there is no all-workers-accounted-for gate before closing PTW-001.
- [GOOD] — PTW list, filters, QR token, approval timeline, 簽名證明 cert all render. Seed active confined_space + in_review excavation list, filter by 生效中/簽核中; PTW-001 shows worker roster (陳大文/李志強), QR card, chain (safety_officer->main_contractor). Strong surface — narrate around the type-picker limit.
- [GOOD] — Permit chain safety_officer->main_contractor is seeded and honoured (matches 密閉空間 reality: safety signs first).
- [UX] S3 — PTW expiry end-of-HKT-day derived, no active->expired cron. PTW-001 expires_at = 23:59 HKT today; after midnight it stays active until a client derives expiry. Multi-day demo shows it still active next morning.

## 2. 進度 Progress — quantity (米) mode, linear zones

- [GOOD] — Quantity mode fully wired end-to-end. Create (teal 數量 sub-form, unit chips), update (big numeric + ±10 stepper, clamps at qty_total), rollup (quantity-weighting by qty_total when a branch shares one unit), card badge (162/260米), history (本期 +78m), export (162/260米). Seed B/C/D/F items (溝槽 260米, 拆除 240米, 鋪設 440米, 回填 1200m3) all render. Best drainage strength to demo.
- [BUG] S2 — The drainage KPI tiles promised by the template are never rendered. DRAINAGE.kpiTiles=drainage (src/lib/progressTemplates.ts:85) promises Sigma-m / 距交場 tiles, but ProjectDetail only special-cases isMaintenance (src/pages/ProjectDetail.tsx:217,330). Drainage falls through to generic 已完成/進行中/落後/未開始 tiles — identical to general. The 已鋪 X / 共 Y 米 the rollup already computes (rollup.qtySum/qtyTotal/qtyUnit) is never surfaced. Role: PM/老總 glance. Fix: render a drainage KPI strip.
- [UX] S2 — Unit-string mismatch silently disables quantity-weighted rollup. Seed uses qty_unit=米; create-modal default + chips offer m/m2/m3 (CreateItemModal.tsx:31). quantityWeighting requires every leaf in a branch share the exact unit string (src/types.ts:393-398) — mix 米 and m (PM adds a run via default m under 米 parent B) silently reverts to equal-weight averaging, parent % wrong vs metre-weighted, no warning. Fix: normalize 米<->m or align seed/default.
- [GOOD] — 受阻 (blocked) status with reason is a great drainage fit. B.3 大涌橋路 blocked reason 等待業主提供地下管線竣工圖; toggle reasons 雨天/地下水/掘路紙/物料/其他 (UpdateProgressModal.tsx:11) match 渠務 stoppages. Card shows amber 受阻 chip. Demo this.
- [BUG] S2 — Seed-authored progress_history for D.1 attributed to 判頭(60001005), but app gates progress writes to supervisors. Seed two history ticks set updated_by=60001005 (subcontractor, lines 333/336). canManageStructure grants update only to membership roles [pm,general_foreman,main_contractor] (ProgressContext.tsx:99) — 判頭 excluded; canUpdateItem only allows assigned items, and D.1 sets no assigned_to. So the persona who supposedly laid the pipe cannot record those ticks in the live app. Role: 判頭.
- [UX] S3 — CLAUDE.md documents canEdit=[pm,main_contractor,subcontractor] but code uses [pm,general_foreman,main_contractor]. Doc/code drift; subcontractor swapped for general_foreman. Confirm intended set for 判頭-heavy 渠務 sites.
- [UX] S3 — zoneNoun 路段 / labelNoun 工序 only relabels copy; zones still admin-defined free strings. Drainage zones are chainages (CH0-CH120) but the create-item floors generator still says 樓層數 / 起始(負為地庫) — meaningless for 路段/沙井. No chainage-aware helper. quantity default sidesteps it but checklist/floors copy is building-centric.
- [GOOD] — Deep tree (大項->中項->細項) + per-zone rollup + schedule variance render cleanly for the 8-大項 / 路段-中項 / 細部工序 structure.

## 3. 天氣 Weather / EOT (暴雨)

- [GOOD] — Weather/EOT page well-suited to 渠務 暴雨 claims. WeatherRecord lists territory weather_events (黑雨/黃雨/雨量78mm/酷熱) joined to per-day project_weather_claims with CEDD App-7.4 fields (關鍵路徑/本可施工/善後/申請EOT). Seed 黑雨 claim (1.5日) + 黃雨 record-only (0日) demo the claim-vs-record distinction. Excel/PDF export ship via shareOrDownloadBlob (native-safe).
- [UX] S2 — Live WeatherBanner stop-work copy is wrong for drainage. Hardcodes 惡劣天氣警告生效 — 應停止戶外高空/吊運工作 (src/components/WeatherBanner.tsx:37). For 渠務 the暴雨 risk is 溝槽積水/掘路停工/密閉空間進水, not 高空/吊運. Fix: project-type-aware or generic copy.
- [UX] S3 — EOT claim has no link to the blocked progress item or the daily. Seed 黑雨日 also has a daily + blocks B.2; claim/daily/blocked-item are three disconnected records. A 渠務 EOT dispute wants them stitched.
- [GOOD] — 24h雨量>20mm objective trigger (seed rainfall_20mm 78mm 沙田 N05) matches the private SFBC/房署 standard the footnote cites — credible for 渠務 EOT.

## 4. 問題 Issues + escalation

- [BUG] S1 — safety_officer cannot be a handler and cannot act on safety issues they did not report. Role: safety_officer (60000004). IssueHandlerRole enum is pm|main_contractor|subcontractor|admin (src/types.ts:452) — no safety_officer. getInitialHandler has no safety_officer case -> defaults pm (:513). canActOnIssue has no safety_officer branch (IssuesContext.tsx:260). Seed issue #4 (護土板鬆動, 掘地安全) reported by safety_officer, handler main_contractor; safety officer can only reopen/resolve it as reporter, never routed/act on another. Wrong authority model for a 密閉空間/掘地 site.
- [BUG] S1 — general_foreman (老總) is invisible in the entire issue chain. Role: 老總 (60001002). No getInitialHandler case (defaults pm), no canActOnIssue branch. The on-site boss cannot act on any issue routed to subcontractor/main_contractor/pm unless they reported it; reporting routes to pm, skipping their authority.
- [UX] S2 — No 密閉空間/掘地-specific safety lane in escalation. Seed issue #1 (CH150 未標示電纜) correctly walks worker->判頭->總承建. But a stop-work safety issue (護土板鬆動 #4) routes the same generic chain as cosmetic ones — no fast-path to safety_officer/PM with a stop-work flag.
- [GOOD] — The worker->判頭->總承建 escalation on issue #1 (未標示電纜) is a textbook 渠務 demo. Comment trail (停工圍封->判頭上報->總承建約中電驗線) renders fully in IssueDetail.
- [GOOD] — Issue #/location fields + Excel export (問題清單 + 處理紀錄 sheets) carry CH150/MH2/CH180 — good where 邊一段 matters.

## 5. SI 工地指令 / VO 變更指令 (岩石開挖->破碎機 chain)

- [GOOD] — SI-001(locked, 遇岩石)->VO-001(破碎機計價) chain is the strongest commercial demo. SiDetail shows the locked SI, 就此工地指令提出變更指令 button, related VO link, 抗議 tab (seed has 判頭 protest re: night-work permit). VO line items (液壓破碎機 60m3 @850c, 棄置 60m3 @220c) total HKD64,200 server-recomputed. Walk SI->VO->chain (mc->pm->owner) for the money story.
- [UX] S3 — VO chain step 2 = owner, but the seed project has no owner member. VO chain mc->pm->owner (seed line 451); no owner persona is a member. VO-001 advances mc->pm then dead-ends at owner — approver bar shows 等待 業主 forever. Role: PM. Fix: seed an owner member or make owner optional for 渠務.
- [UX] S3 — SI geo-pin (22.38/114.18) renders a generic OSM tile, not the chainage. Acceptable.
- [GOOD] — VO PDF export embeds Noto Sans HK so 破碎機/棄置 line items print in Chinese — credible for an owner-facing 渠務 變更 claim.

## 6. 物料 Materials (overdue 沙井 delivery)

- [BUG] S2 — Two supervisor gates on the same screen disagree. Role: main_contractor (60001003). MaterialsContext.canManage (FAB/create) grants membership roles [pm,main_contractor,general_foreman,subcontractor] (MaterialsContext.tsx:117), but MaterialList.isSupervisor (per-card 編輯/刪除/入貨) uses global_role and only admin|pm|general_foreman + assigned PM (MaterialList.tsx:151-156) — OMITS main_contractor and subcontractor. So a main_contractor sees 加物料 FAB but cannot edit/receive any row they did not create (only via isOwner). Seed 判頭 requested 4/5; 60001003 created only 粒料 — cannot 入貨 the 判頭 overdue 沙井 MH3. Fix: unify (prefer the membership-role version).
- [GOOD] — Overdue derivation correct and demo-ready. isMaterialLate flags requested + past planned_arrival. Seed #3 (預製沙井 MH3, planned 3 days ago, 0 arrived) shows red 逾期 + 供應商延誤已催 — a real risk (MH3 吊裝 blocked, ties to progress E.1).
- [GOOD] — Material<->progress linkage (item_ids -> D.1/D.4/E.1/F.1) lets the 沙井 delivery show 已連結進度項目. Good traceability.
- [UX] S3 — No per-unit-price or supplier field. A 判頭 ordering 44 支 HDPE wants supplier (黃工/喉管供應 lives in 聯絡人, not linked here).

## 7. 機械/表格 Equipment (法定週期檢查)

- [GOOD] — Forms-expiry dashboard is an excellent 渠務-adjacent demo. EquipmentList shows 5 status tiles (有效/即將到期/過期/未簽/停用) + per-equipment chips. Seed: EQ-002 (汽車吊機 25T, 沙井吊裝) LALG-F1 餘 5 日 (amber); EQ-001 (挖掘機 Komatsu) CSSR-F4 過期 1 日前 (red). 起重機械 + 挖掘工程 kinds map to 渠務 plant. Print-all-QR + 匯出登記冊 round it out.
- [UX] S3 — excavation equipment kind has no auto-link to the 掘地 PTW. EQ-001 (挖掘機) and PTW-002 (excavation) are unrelated records.
- [GOOD] — Credential gate (VerifyCredentialsPanel) for qualified-person sign-off fits 吊機/吊船 statutory signer requirement.

## 8. 文件 Documents (物料報批 + 密閉空間方法聲明)

- [GOOD] — Document register with versions + review states fits 渠務 submittals. Seed: MAT-001 (HDPE 600mm 報批, v1 superseded 缺ISO證書 -> v2 approved), MS-001 (密閉空間作業方法聲明, v1 submitted by safety_officer). The supersede/approve trail with review notes is a strong 報批 demo.
- [UX] S2 — 文件 module is flag-gated (files_enabled) AND module-gated. ToolsSwitcher.showFiles needs (filesEnabled||admin) AND isModuleEnabled(documents) (ProjectDetail.tsx:723). If files_enabled is off in app_config, the 渠務 team cannot reach MS-001/MAT-001 except as admin — seed documents invisible in the demo unless the flag is on.
- [MISSING] S3 — No document-type for 渠務 CCTV survey (WRc) or DSD 驗收紀錄. DocumentType is material_submission/method_statement/drawing/inspection/other (src/types.ts:576). Seed H. CCTV 檢測 has no natural home beyond inspection/other.

## 9. 每日日誌 Dailies

- [BUG] S2 — 老總 (general_foreman) and 判頭 cannot write the daily log. Role: 老總 60001002 / 判頭 60001005. canAuthor requires global_role==main_contractor AND sub_role foreman/engineer (DailyList.tsx:53-56). On a 渠務 site the 老總 keeps the diary and the 判頭 records his gang — both locked out. cannotAuthorReason has no branch for general_foreman/safety_officer (:60-73) — they get the generic 你嘅角色唔可以寫 with no useful explanation.
- [GOOD] — Daily captures 天氣(上晝/下晝)+警告信號+出勤(渠工/泥水/管工)+機械(挖掘機/泥頭車/抽水泵)+freeform. Seed 3 dailies (黃雨抽水/天氣好轉/酷熱遮蔭) are realistic 渠務 entries. Severe-signal red badge for 黑雨/紅雨/T8 works.
- [UX] S3 — Daily weather/warning captured independently from weather_events/EOT. Foreman re-types 黃雨 while the EOT page already has it from HKO. Duplicate entry; no cross-link.
- [BUG] S3 — Seed dailies authored by 60000002 (engineer) and 60001004 (foreman) who are NOT members of the drainage project. Not in the project_members insert (only 6 roles). dailies_insert RLS likely requires membership + main_contractor/sub_role — these rows may be unreachable/un-editable in the live demo and names will not resolve. Verify membership of 60000002/60001004.

## 10. 行事曆 Timetable

- [GOOD] — Events (會議/檢查/里程碑) seeded sensibly: 每週協調會, DSD 渠管中段檢查 (CH60), 里程碑 雨水渠 CH0-CH120 完工. inspection+milestone types fit 渠務 (DSD 驗收 is the real gate). Renders on the timetable page.
- [UX] S3 — No event<->progress or event<->PTW linkage. DSD 中段檢查 does not reference D.1; milestone does not reference H.1 CCTV. Standalone entries.
- [MISSING] S3 — No recurring-event support. 每週協調會 is a single row; a weekly meeting needs recurrence.

## 11. 聯絡人 Contacts

- [GOOD] — Address book fits 渠務 supply chain. Seed: 陳師傅(渠務判頭), 黃工(喉管供應), 中電工程組 CLP(地下電纜驗線). The CLP contact directly supports the issue #1 narrative — 一鍵打電話 to CLP. Trade-tagged.
- [UX] S3 — Contacts are free-text and not linked to issues/materials. CLP contact and issue #1 (CLP 驗線) unrelated; 喉管供應 and material orders unrelated. Tap-to-call from the blocked item would close the loop.

## 12. 模組設定 Modules (per-project switches)

- [GOOD] — Admin can toggle any of 13 modules per project; tabs/cards hide live over realtime, 進度 non-disableable. ProjectDetail gates 問題/簽核/工具/助理 tabs + every tool card on isModuleEnabled, and bounces off a disabled tab (:132-140). Clean turn-off-天氣-for-this-渠務-site demo.
- [UX] S2 — Cross-site Dashboard mis-counts because it has no ModulesProvider. 處理中問題 is RLS-filtered (disabled-issues projects return 0) but the page footnotes it rather than computing per-project (Dashboard.tsx:178-182). Known soft spot.
- [UX] S3 — No drainage-specific default module set. A 渠務 project ships with all 13 on; an admin must manually disable building-centric ones. A project-type default profile would help.

## 13. AI 站長 Assistant

- [GOOD] — Assistant gated on ai_enabled (seed true) AND assistant module; mutate-via-confirm-card (propose->confirm->execute) is a safe design.
- [UX] S2 — Assistant only loads with project context the read-only personas may lack. Combined with dashboard/role gates, the 老總/判頭 reach the assistant only inside the project; the get_weather_outlook preventive value is highest for them but surfacing is limited.
- [MISSING] S3 — No drainage-tuned assistant prompt (e.g. remind me to renew the confined-space gas test, which 路段 is behind by metres). Generic 站長 prompt.

## Cross-cutting

- [BUG] S2 — DataIntegrity 匯出證明 uses anchor-download, blocked in Capacitor WebView (iOS/Android). exportProof builds an a-download and clicks it (DataIntegrity.tsx:50-56) — the same pattern export.ts documents as blocked on native (where it uses shareOrDownloadBlob). On the iOS/Android demo the tamper-proof JSON export silently does nothing. Role: admin. Fix: route through shareOrDownloadBlob. (The hash-chain verify UI itself is a GOOD demo surface.)
- [BUG] S1 — Non-admin members (老總/判頭/管工/工人/safety) cannot reach the cross-site Dashboard. visibleProjects for non-admin = only assigned_pm_ids.includes(uid) (Dashboard.tsx:39-43); the route also redirects non-PM/non-admin to /home (:151). For drainage ONLY the PM (60001001)+admin see the dashboard; the 老總 (who most needs the site overview) is bounced. By design, but a real friction point for the everyone-knows-what-is-happening value prop.
- [UX] S2 — Role-gate logic is inconsistent: some screens use global_role, some use per-project membership role. Progress+Weather+Materials(canManage) key on membership role; Materials(isSupervisor)+Dailies key on global_role. For 渠務 where someone may be main_contractor globally but general_foreman by membership, capabilities differ screen-to-screen. Audit and unify.
- [UX] S3 — general_foreman + safety_officer are first-class global roles but second-class downstream (no issue handler slot, no daily authoring, no dashboard, partial materials). These are exactly the roles a 渠務 site leans on (老總 runs it, safety gates 密閉空間/掘地). Systemic gap worth a dedicated pass.
- [GOOD] — Quantity-weighted rollups, blocked-reason status, EOT objective triggers, SI->VO money chain, forms-expiry dashboard, and tamper-evident ledger together tell a coherent, drainage-credible story once the PTW type-picker and role-authority gaps are addressed.

---

### Demo-day shortlist (highest impact)
1. PTW: enable + template confined_space and excavation; render gas_test/hazards/controls (S1, the defining 渠務 gap).
2. Issues: give safety_officer + general_foreman real handler/act authority (S1).
3. Progress: render the drainage KPI tiles (Sigma-米 / 距交場) the template already promises (S2).
4. Materials: unify the two contradicting supervisor gates (S2).
5. Dailies: let 老總/判頭 author or clearly explain why not (S2).
6. VO chain: seed an owner member (or make owner step optional) so VO-001 does not dead-end (S3).
7. Native exports: route DataIntegrity proof through shareOrDownloadBlob (S2).
