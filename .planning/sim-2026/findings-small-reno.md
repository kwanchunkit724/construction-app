# Simulation Findings — 小型裝修 (small_works) project

**Project:** [DEMO] 小型裝修 — 旺角寫字樓內部翻新 (d0000002-0002-0002-0002-000000000002, project_type=small_works, ai_enabled=true)
**Method:** STATIC review (no network). App source under src/ vs .planning/sim-2026/seed-small-reno.sql.
**Personas (test1234):** admin 60000099, PM 60001001, main_contractor/engineer 60001003, general_foreman/老總 60001002, subcontractor/判頭 60001005, worker 60001006, safety_officer 60000004.
**Tags:** [BUG] [UX] [MISSING] [GOOD] [PERM]. **Severity:** P1 blocks/data-wrong, P2 notable, P3 polish.

## 0. CROSS-CUTTING: small_works project type + zones

### [BUG] P1 — small_works seed has TWO zones but template hides ALL zone chrome -> two unlabeled, indistinguishable lists
Role: everyone. Files: progressTemplates.ts (SMALL_WORKS.autoZone=true, zoneNoun=null); ProjectDetail.tsx ZoneSection (hideZoneHeader renders only a bare 加入大項 button, no zone name); seed tags items zone_id z1/z2.
Scenario: seed defines z1 (A區 開放式辦公區) + z2 (B區 會議室/茶水間/洗手間) and tags every item with one. autoZone hides zone chrome, but ProjectDetail still maps one ZoneSection per zone with the header SUPPRESSED -> two consecutive 大項 blocks with no z1/z2 label and no divider, looking duplicated/broken. Design assumed autoZone = ONE implicit zone; seed gives two.
Fix: seed single zone, OR when autoZone and zones>1 fall back to showing zone headers, OR always show ProgressItemCard zoneLabel chip.

### [BUG] P2 — autoZone hides zones in 進度 but Dashboard + export still expose "N 個分區"
Role: PM/admin. Files: Dashboard.tsx (~214 leafCount 個 leaf, project.zones.length 個分區); export.ts + ExportProgressModal (groupByZone uses project.zones).
Scenario: inside project zones hidden, but Dashboard tile says 2 個分區 and progress export prints two zone sections. Hidden-zone abstraction leaks once you leave 進度.
Fix: Dashboard + export honour templateFor(type).autoZone -> flat list, no 分區 count.

### [UX] P2 — small-works KPI tile kind is defined but never rendered (dead config)
Files: progressTemplates.ts (SMALL_WORKS.kpiTiles=small-works); ProjectDetail.tsx only special-cases isMaintenance.
Scenario: maintenance gets bespoke 法定限期 tile; small-works falls to generic status-count tiles. Most useful reno headline (距交場 X 日 from G.3 業主驗收 planned_end) is promised but unimplemented.
Fix: implement small-works KPI strip, or drop dead small-works/drainage KpiTilesKind values.

### [GOOD] — autoZone correctly hides 尚未設定分區 dead-end + create-project zone editor (clean 2-field create flow). Defensive templateFor() degrades unknown type to general.

## 1. 進度 (Progress)

### [GOOD] — Mixed tracking modes render correctly: percentage (B), checklist (A.1/B.2/C.1/E.2), quantity (B.1 320m, D.1 m2), blocked (B.3 受阻), delayed (B.4). Right per-mode chips. Strong demo variety.

### [BUG] P2 — small_works allowedModes = [checklist,percentage] but seed uses quantity leaves the create UI cannot author
Role: PM/老總 adding items. Files: progressTemplates.ts SMALL_WORKS.allowedModes; seed B.1/B.1.1/B.1.2/D.1/D.2/D.3 are quantity.
Scenario: existing quantity items display fine, but CreateItemModal for this type hides 數量 mode -> cannot add a new m2/m item. Data model + seed use quantity; authoring UI forbids it.
Fix: add quantity to SMALL_WORKS.allowedModes (reno has area/length), or document read-only.

### [UX] P2 — status derives live from schedule-vs-today, so stored seed status values are partly ignored (narration caveat, not a code bug).

### [BUG] P2 — Quantity rollup weighting only triggers when EVERY leaf under a parent is quantity+one-unit; B 機電 mixes modes -> parent % is unweighted mean
Files: types.ts quantityWeighting/computeRollup.
Scenario: under B: B.1 quantity(m), B.2 checklist, B.3 %, B.4 % -> weighting null -> each child weighs equally. B.1 (80%, big 320m run) counts same as B.3 (20% blocked). For a reno where electrical is the bulk, equal weighting misrepresents true progress. Known conservative-design limitation.

### [UX] P3 — Level-3 indent (level-1)*0.85rem too shallow on 390px phone for the real 3-level chains (B->B.1->B.1.1/.2/.3, C->C.1->C.1.1/.2/.3). Fix: deeper indent / guide line.

### [GOOD] — get_visible_progress_items RPC scopes tree by role; worker 60001006 (assigned B.1 + children) only sees their items in progress + daily picker. Good least-privilege.

### [PERM] P2 — assigned worker can set/clear 受阻 via the same UpdateProgressModal
Role: worker 60001006. Files: ProgressContext.canUpdateItem; UpdateProgressModal.save calls setBlocked.
Scenario: worker assigned B.1 opens 更新 -> sees 標記為受阻 toggle. Blocking is arguably a supervisor/escalation call. Fix: gate 受阻 toggle on canManageStructure; confirm server RLS.

## 2. 問題 (Issues)

### [GOOD] — Escalation chain + numbering render seeded threads right: I-1 (worker->判頭 open), I-2 (判頭->總承建商 escalated), I-3 (老總->總承建商 resolved), I-4 (工程師->PM escalated). Good demo.

### [BUG] P2 — reporter role general_foreman missing from getInitialHandler switch -> defaults to pm, but seed I-3 placed it at main_contractor
Files: types.ts getInitialHandler (no general_foreman case -> default pm); seed I-3 handler main_contractor.
Scenario: app-created 老總 issue routes to PM (skips 總承建商) but seeded one sits at 總承建商 -> inconsistent. For small reno 老總->總承建商 first is natural. Fix: add case general_foreman: return main_contractor and align seed.

### [BUG] P2 — safety_officer reporter also missing from getInitialHandler -> routes to pm (silent default)
Scenario: on a hot-work reno the safety officer most likely raises safety issues; they bypass 總承建商. Fix: add explicit case to make routing intentional.

### [MISSING] P2 — Issues have no structured link to a progress item (location is free-text)
Files: seed issues (location text), Issue type (no progress_item_id).
Scenario: I-2 (灑水頭) clearly = B.3, I-4 (水喉) = B.4, but link lives only in prose. Dispute trail wants this issue blocked this item. Fix: add optional progress_item_id FK + surface on card.

### [UX] P3 — ISSUE_STATUS_ZH.open=處理中 shows even before anyone acts. Cosmetic.

## 3. SI (工地指令)

### [GOOD] — SI-001 locked (玻璃間隔, full MC->PM audit) + SI-002 in_review (電熱水爐) land in right filter pills; SI-001 drives VO-001. Clean SI->VO demo.

### [PERM] P2 — safety_officer + general_foreman cannot create an SI (canSubmit = pm/main_contractor/subcontractor)
Role: 老總 60001002, safety 60000004. Files: SiContext.canSubmit.
Scenario: on small reno the 老總 (top progress updater) often raises practical instructions but has no SI authoring right. Likely intentional (mirrors can_edit_project_progress) - confirm for small_works. Fix: decide if general_foreman is a 4th author; align UI+RLS.

### [UX] P2 — SI list/cards do not show WHO approves next until you open the SI
Files: SiCard.tsx (步驟 n/n only, no role); SiList.
Scenario: SI-002 in_review shows 步驟 1/2 but not that 總承建商 is current approver -> 判頭 cannot tell who to chase. Fix: surface 待 總承建商 簽核.

### [BUG] P3 — SiContext fetches ALL approvals where doc_type=si + ALL protest_comments with no project filter
Files: SiContext.refetch.
Scenario: RLS narrows rows but client pulls cross-project rows then buckets by doc_id. Wasteful; latent leak if RLS loosened. Fix: .in(doc_id, siIds) and .in(si_id, siIds).

## 4. VO (變更指令)

### [GOOD] — HKD totals server-recomputed; VO-001 (玻璃差價, incl. NEGATIVE -220000 退回石膏 line -> net 1,670,000) + VO-002 (電熱水爐 470,000). Realistic swap-and-credit reno change order. Great demo of credit lines + SI linkage.

### [PERM] P2 — VO-002 is draft created by engineer; confirm the 判頭 (who prices the change) can submit
Role: 判頭 60001005. Files: seed VO-002 created_by 60001003 status draft; VoContext canSubmit (mirrors SiContext).
Scenario: 判頭 priced the electrical change but engineer owns the draft; if only creator can advance, 判頭 cannot push own pricing. Fix: verify draft->submit gate; consider any VO-author-role member can submit.

### [MISSING] P3 — VO line references progress_leaf_item_id (VO-001 line1 -> C.3 玻璃間隔) but no back-link from the progress item to its VO
Scenario: standing on C.3 you cannot see pending VO HKD 16,700. For a reno where scope creep = money this link is valuable. Fix: VO badge on referenced leaves.

## 5. PTW (工作許可證)

### [GOOD] — Realistic hot-work PTW-001 (風喉鋼支架燒焊): full 安全主任->PM chain, 5-item fire-watch checklist all ticked, 2 named workers, HK-day expiry. Exactly the hot-work a reno produces.

### [BUG] P2 — Expiry is end-of-HK-day; if demo runs the day AFTER seed, PTW-001 expires at midnight but status stays active (no cron flips it)
Files: seed expires_at=today 23:59 HKT; CLAUDE.md note derive expired client-side; PTW_STATUS has expired.
Scenario: a stale 生效中 hot-work permit on screen is a safety-credibility problem. Verify PtwCard/PtwDetail downgrade past-expiry active to 已過期 (like materials isMaterialLate). Fix: derive display status from expires_at<now, and/or re-seed same-day.

### [PERM] P2 — permit_workers store login phones (60001006/60001007) as free-text; not FK to user_profiles
Scenario: 60001007 is not a persona; workers are not linked to accounts (QR/credential checks will not tie to them). Fine if intentional - do not imply they are app users in demo.

### [MISSING] P3 — No PTW<->progress-item or PTW<->method-statement link though seed relates PTW-001 to B.2 風喉 + DOC-2 MS-001 (熱工序方法). Dispute trail wants permit+method+work in one view.

## 6. 物料 (Materials)

### [GOOD] — Four lifecycle states (arrived / 50-90 partial / future / overdue 電熱水爐) + item links + 逾期 chip/filter. Exactly the where-is-my-料 view a 判頭 needs.

### [PERM] P2 — main_contractor (engineer) is NOT a material supervisor; can only mutate own rows
Role: engineer 60001003. Files: MaterialList.tsx isSupervisor (admin|pm|general_foreman|assigned PM - NOT main_contractor); seed 電熱水爐 requested_by 60001003.
Scenario: engineer can edit only the row they requested (as owner), NOT the 判頭 石膏板 partial. On small reno the engineer usually chases ALL deliveries. Asymmetry. Fix: decide if main_contractor is a material supervisor; SI/Weather gates DO include them -> materials inconsistent.

### [BUG] P2 — Material supervisor uses GLOBAL role (profile.global_role) unlike progress/SI/weather which use per-project membership role
Files: MaterialList.tsx isSupervisor reads profile.global_role; contrast ProgressContext.canManageStructure / SiContext.canSubmit (memberships.role).
Scenario: works in seed only because PM 60001001 is pm both globally + by membership. A PM-by-membership with different global_role would lose material supervision. The role gating in TWO places must stay aligned drift CLAUDE.md warns about. Fix: mirror per-project membership role.

### [GOOD] — Materials link to progress items (item_ids): 石膏板->C.1, 地毯磚->D.2, 電熱水爐->B.4, 電線->B.1, 天花骨料->C.2. MaterialItemsPanel 需用物料 on each leaf closes the loop (叫料 tied to工序). Strong reno demo.

## 7. 每日日誌 (Dailies)

### [BUG] P1 — Only main_contractor with sub_role foreman/engineer can author a daily; the 老總 (general_foreman) CANNOT write the log
Role: general_foreman 60001002. Files: DailyEdit.tsx canAuthor = global_role===main_contractor and sub_role in (foreman,engineer).
Scenario: on 小型裝修 the 老總 is typically the on-site diary keeper. Here authoring is locked to 總承建商 sub-roles; the 老總 (top progress updater) sees red 只有總承建商管工或工程師可以填寫日誌 and cannot save. Real workflow gap. Fix: allow general_foreman (or membership-based gate) for small_works.

### [BUG] P2 — canAuthor requires a sub_role; a main_contractor with sub_role=null is blocked - and the seed never sets 60001003.sub_role
Files: DailyEdit.tsx; seed resolves engineer by phone but does not set sub_role.
Scenario: if 60001003.sub_role is null (signup leaves it null), even the intended diary keeper is locked out -> whole dailies demo dead-ends with disabled 儲存. Fix: fall back to any approved main_contractor member can author, or ensure seed/onboarding sets sub_role. Verify before demo.

### [GOOD] — Rich daily: AM/PM weather + warning signals + manpower/plant + linked items + 複製琴日. Seed has 3 days incl. 黃雨 + 酷熱天氣警告. Good daily-cadence reno story.

### [UX] P2 — yesterday daily immutable (尋日嘅日誌已鎖); with the narrow author gate, a missed day cannot be backfilled by anyone. Good for audit; note for demo.

## 8. 行事曆 (Timetable / Events)

### [GOOD] — Seeded events cover meeting (每週工地會議) / inspection (消防則師到場->I-2) / milestone (機電完工). Good cross-module coherence.

### [MISSING] P2 — Events do not auto-derive from material arrivals / progress planned_end / PTW expiry though the card subtitle promises 物料到貨, 進度完工
Files: ToolsSwitcher 行事曆 subtitle; TimetablePage/EventsContext.
Scenario: events is a manual table; seed material planned_arrival_at (地毯磚 +7d) + item planned_end (G.3 驗收) are NOT auto-calendar entries. Verify merge; if none, subtitle over-promises. Fix: merge derived dates or soften subtitle.

## 9. 聯絡人 (Contacts)

### [GOOD] — Per-project address book + trade filter + tap-to-call. Trade pills (水電/冷氣/玻璃間隔/系統傢俬) match the reno tree (B/C.3/F). tel: link mobile-correct. Clean.

### [PERM] P2 — Contacts admin/PM-curated (canManage); the 判頭/老總 who know the subbies are read-only
Role: 判頭 60001005, 老總 60001002. Files: ContactsContext.canManage; seed contacts all created_by PM.
Scenario: people with the real numbers (判頭) cannot add. For a small reno the 判頭 phonebook IS the value. Fix: consider allowing main_contractor/subcontractor/general_foreman to add.

### [UX] P3 — Contacts pure free-text, no dedupe / no user_profiles link (發記水電 phone 69001234). Acceptable for a phonebook.

## 10. 機械 / 表格 (Equipment + statutory forms)

### [GOOD] — Two plant (活動棚架 EQ-001, 物料吊運絞車 EQ-002) with weekly checks: CSSR-F5 valid +10d, LALG-F1 吊機 expiring +1d. 5-bucket colored dashboard + 餘 N 日 chips. Strong safety story; 吊機 即將到期 餘 1 日 great reminder demo.

### [PERM] P2 — Equipment ENTRY gated to admin/PM/main_contractor/safety_officer; the 判頭 (owns scaffold/hoist) + 老總 cannot reach 機械/表格 from 工具 tab
Role: 判頭 60001005, 老總 60001002. Files: ToolsSwitcher.showEquipment.
Scenario: on small jobs the 判頭 owns the棚架/絞車 but does not see the card. Code comment admits it is a stop-gap pending a get_forms_enabled flag. Fix: add general_foreman (+ consider subcontractor), or finish flag/context.

### [BUG] P2 — Form signer (safety_officer) has no seeded credential -> the sign-on-your-phone flow may reject
Role: safety 60000004. Files: seed form_instances.assigned_signer_id=60000004; record_form_signoff credential gate via user_credentials; seed inserts NO user_credentials for 60000004.
Scenario: templates have required_credential; signing the 吊機 check (due tomorrow) likely fails the qualified-person gate. Demo dead-ends. Fix: seed a verified user_credentials row for 60000004 matching 棚架/吊機 competent person, or pick a credentialed signer.

### [MISSING] P3 — No equipment<->PTW link though EQ-001 棚架 (work-at-height) + hot-work PTW share A區頂 worksite.

## 11. 文件 (Documents) — flag-gated

### [GOOD] — MAT-001 地毯磚送審 (approved by PM) + MS-001 燒焊方法 (submitted, ties to hot-work PTW). Clean submit->review demo.

### [BUG] P2 — Documents surface ALSO requires global files_enabled flag; if off, non-admins see NO 文件 card despite all-modules-on + seeded docs
Role: PM/判頭. Files: ToolsSwitcher.showFiles = (filesEnabled || admin) and isModuleEnabled(documents); FilesFlagContext.
Scenario: seed sets 13 modules on + inserts docs, but the 文件 card needs the global flag too. If off, only admins see 文件; per-item affordance falls back to legacy 圖則. Verify files_enabled ON for demo env or documents looks dead.

### [UX] P3 — Two overlapping file systems (per-item 圖則 Drawings vs 文件 Documents) toggled by a flag; seed has NO drawings rows so flag-OFF shows 圖則(0) empty. Mildly confusing.

## 12. 天氣 (Weather / EOT)

### [GOOD] — Territory weather_events (amber_rain/very_hot/rainfall_20mm) + 2 per-project EOT claims with CEDD fields + Excel/PDF export. 36mm 旺角 + 黃雨 days noted 室內裝修為主 未影響關鍵路徑 (0-day claim). Honest logged-but-did-not-claim reno demo.

### [BUG] P2 — get_recent_weather_events(120) is territory-wide; the page may list weather days seeded by OTHER demo projects for the same dates
Files: WeatherRecord.load (events from RPC; claims filtered by project_id).
Scenario: weather_events are HK-wide facts (correct), but the event chips are not project-scoped - other seeds events for overlapping dates appear here too. Claims ARE per-project (good). Narration: events HK-wide, claims per-project. Fix: none if intended.

### [UX] P3 — EOT export buttons only show when claims.length>0; a project with events but no claims has no export. Minor (nothing to export).

## 13. AI 助理 (Assistant) — ai_enabled=true

### [GOOD] — Project ai_enabled=true so 助理 tab shows; good to demo 站長 summarising the blocked 灑水頭 / overdue 電熱水爐 on this data-rich seed.

### [UX] P2 — Assistant gated behind BOTH ai_enabled (project) AND assistant module; toggling either off silently hides 助理 with no hint why. Note for ops.

### [MISSING] P3 — No indicator distinguishing off-because-module vs off-because-project-flag. Minor diagnostic gap.

## CROSS-CUTTING continued

### [BUG] P2 — Dashboard only shows admin or assigned_pm_ids projects; 判頭/老總/engineer/safety bounced to /home, no portfolio view
Role: all except admin + assigned PM. Files: Dashboard.tsx visibleProjects filter + Navigate to /home guard.
Scenario: engineer/判頭/老總 are core daily users with NO dashboard. The 判頭 + 工地主任 always know what is happening value-prop is undercut for 主任-class roles who are not the assigned PM. PM 60001001 sees it; 老總 60001002 does not. Fix: read-only dashboard scoped to approved memberships for general_foreman/main_contractor.

### [GOOD] — Module gating bounces you back to 進度 if the active tab module is turned off mid-session (realtime). No stranded blank tab.

### [PERM] P2 — owner (業主) is not a seeded member though G.3 業主驗收及交收 exists; the read-only owner view + handover sign-off is untested here
Files: seed project_members (6 roles, NO owner); types.ts owner read-only.
Scenario: reno value-prop includes業主-driven 驗收 (G.3 checklist 機電測試/油漆/傢俬/標識/清潔/文件交收) but no owner persona exercises it. Fix: add owner member to seed for the業主-facing demo.

### [UX] P2 — CreateItemModal still shows the multi-zone 套用到分區 picker (z1/z2) for autoZone small_works
Role: PM/老總 adding a 大項. Files: CreateItemModal.tsx (isRootAdd and allZones.length>0 renders zone checklist from project.zones).
Scenario: adding a root 大項 pops 套用到分區 with z1/z2 - contradicts the no-zones-for-this-type promise, re-exposing hidden zones at the authoring step. Fix: when autoZone, hide zone multi-select + default to single zone (ties to finding 0.1).

### [GOOD] — Offline read cache on progress (cacheGet/cacheSet + refetch-on-reconnect). Relevant even for a Mong Kok office reno (lift-lobby dead zones).

## TOP ITEMS FOR REVIEW/DEMO
1. [BUG P1] 0.1 small_works 2 zones vs hidden zone chrome -> confusing duplicated/unlabeled lists (re-leaks via Dashboard/export/create-item).
2. [BUG P1/P2] 7.1/7.2 Daily-log author gate locks out 老總 + breaks if engineer sub_role null -> dailies demo can dead-end.
3. [BUG P2] 5.2 PTW expiry not flipped server-side; verify UI downgrades past-expiry active hot-work to 已過期.
4. [BUG P2] 10.3 Form signer (safety) has no seeded credential -> sign-on-phone flow may reject.
5. [BUG/PERM P2] Role drift: materials uses global role (others use membership); main_contractor excluded from materials but in SI/weather; general_foreman excluded from SI/equipment/dailies.
6. [BUG P2] 11.2 Documents need global files_enabled ON or seeded MAT-001/MS-001 invisible to non-admins.

Net: seeded data is rich and exercises all 13 modules (strong GOOD demo surface); the small_works zone abstraction and per-module role gates are the two themes producing the most actionable bugs/friction.
