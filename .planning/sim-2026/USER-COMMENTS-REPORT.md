# 用戶意見全報告 — 4 類型地盤模擬
# Full Per-User Comment Report

> 來源：4 個 [DEMO] 項目（大地盤/小型裝修/渠務/大樓維修）嘅角色模擬。按【用戶/角色】分類：第一人稱心聲 + 逐項意見（🔴壞咗/唔順 · 🟣想要但冇 · 🟢用得好）+ 修復狀態。2026-06-16。

## 摘要 — 共 163 條意見（去重後），8 個用戶角色

| 用戶 | 壞/唔順 | 想要 | 用得好 |
|---|--:|--:|--:|
| PM | 18 | 2 | 9 |
| 老總(general_foreman) | 18 | 0 | 2 |
| 總承建商(main_contractor) | 18 | 0 | 5 |
| 判頭(subcontractor) | 18 | 0 | 5 |
| 工人(worker) | 12 | 0 | 6 |
| 安全主任(safety_officer) | 17 | 0 | 5 |
| 業主(owner) | 5 | 0 | 4 |
| admin | 18 | 0 | 1 |

---

## PM

> **心聲**：我權限最大，跨 4 個地盤都睇到進度同問題。最爽係一鍵匯出業主版/內部版/例外版報告，直接 WhatsApp send 老闆。痛點：跨項目 Dashboard 一開始淨係我同 admin 入到，其他主管畀人踢返 /home；有啲 flagship 文件嘅簽核紀錄係空白；業主版要我逐個項目整。

**🔴 唔順 / 壞咗（已修為主）：**
- [大地盤] In-review SI/VO/PTW have an empty 簽核紀錄 timeline. Role: PM/MC reviewers. SI-002, VO-002, PTW-002 are seeded straight to current_step=1, status=in_review with NO step-0 approvals row (seed-big-site.sql sec 5/6/7)
- [大地盤] 老總 (general_foreman) cannot act on issues he did not report. canActOnIssue (IssuesContext.tsx:260) matches handler only for pm/main_contractor/ subcontractor (or admin, or reporter). A general_foreman viewing a
- [大地盤] VO total has no per-category subtotal. VO-002 mixes 鋼結構 (38 噸) + 設計 — only a grand total shows. A category subtotal would help the PM sanity-check a six-figure VO. --- ## 5. 工作許可證 PTW (動火 / 高空 / 吊運 + safety off
- [大地盤] Claim editing is owner-locked (recorded_by = uid RLS). Both seed claims are recorded_by=60001001 (PM). The write gate sets recorded_by: profile.id and RLS requires recorded_by=uid (WeatherRecord.tsx:46,98), so
- [大地盤] Documents module is flag-gated (files_enabled) — invisible to non-admins unless the flag is on. ToolsSwitcher.showFiles and Sidebar both require filesEnabled || admin (ProjectDetail.tsx:723, Sidebar.tsx:26). Fo
- [大地盤] canManage includes general_foreman but the comment claims parity with SI/VO's narrower set. MaterialsContext.tsx:117 adds general_foreman to the membership-role list while the comment (:108) says admin OR assig
- [大地盤] Only main_contractor+foreman/engineer can author; PM and 老總 are locked out. canAuthor / upsertMyDaily require global_role=main_contractor + sub_role in {foreman,engineer} (DailyEdit.tsx:37, DailiesContext.tsx:1
- [大地盤] One daily per (project,user,date) — no consolidated site view. onConflict project_id,user_id,date means each foreman writes their own diary; there is no merged "today's site log". On a multi-trade 大地盤 the PM mu
- [大地盤] Read-only for everyone but admin/PM curators. ContactsContext comment (:77) notes 判頭/老總 are read-only. On a big site the 判頭 cannot add his own sub-trade contacts; only the curator can. Let members propose conta
- [大地盤] AddEquipmentModal cannot attach a form template at creation. Role: PM/MC/safety. The modal (EquipmentList.tsx:241) collects kind/name/brand/serial/location but no ref_no and no form template — you create the ma
- [大地盤] Equipment entry is role-gated with no flag, unlike the rest. Comment at ProjectDetail.tsx:728 notes v55 ships forms_enabled=false but exposes NO get_forms_enabled RPC, so the entry is role-gated (admin/PM/main_
- [大地盤] Cross-project Dashboard is PM/admin-only; MC and 老總 are bounced. Dashboard shows only projects where the user is admin or in assigned_pm_ids, and redirects everyone else to /home (Dashboard.tsx:39,151). On a 大地
- [小型裝修] autoZone hides zones in 進度 but Dashboard + export still expose "N 個分區" Role: PM/admin. Files: Dashboard.tsx (~214 leafCount 個 leaf, project.zones.length 個分區); export.ts + ExportProgressModal (groupByZone uses p
- [小型裝修] small_works allowedModes = [checklist,percentage] but seed uses quantity leaves the create UI cannot author Role: PM/老總 adding items. Files: progressTemplates.ts SMALL_WORKS.allowedModes; seed B.1/B.1.1/B.1.2/D
- [小型裝修] reporter role general_foreman missing from getInitialHandler switch -> defaults to pm, but seed I-3 placed it at main_contractor Files: types.ts getInitialHandler (no general_foreman case -> default pm); seed I
- [小型裝修] main_contractor (engineer) is NOT a material supervisor; can only mutate own rows Role: engineer 60001003. Files: MaterialList.tsx isSupervisor (admin|pm|general_foreman|assigned PM - NOT main_contractor); seed
- [小型裝修] Material supervisor uses GLOBAL role (profile.global_role) unlike progress/SI/weather which use per-project membership role Files: MaterialList.tsx isSupervisor reads profile.global_role; contrast ProgressConte
- [小型裝修] Contacts admin/PM-curated (canManage); the 判頭/老總 who know the subbies are read-only Role: 判頭 60001005, 老總 60001002. Files: ContactsContext.canManage; seed contacts all created_by PM. Scenario: people with the r

**🟣 想要但冇：**
- [大地盤] SI list has no forward link to its derived VO. Role: PM/MC. The SI->VO design-change chain is core to the 大地盤 narrative (SI-001 spawned VO-001), but SiList/SiCard never shows 已衍生 VO-001. The relationship lives
- [大地盤] No cross-project SI/VO/PTW approval inbox. Only documents get the 待我審批 Home tile (Home.tsx:181). A PM who is the approval bottleneck for SI-002 / VO-002 / PTW-002 has no inbox — they must enter each project and

**🟢 用得好（demo 賣點）：**
- [大地盤] Full statutory checklist + QR + signature proof. Hot-work checklist (滅火器/火警監察員/11m 清空), lifting checklist (吊運計劃/CHIT/banksman/風速), per-signoff 簽名證明 cards, and the 3-step MC->safety_officer->PM chain (seed sec 4
- [大地盤] Cross-project 待我審批 inbox on Home. PendingReviewsTile (Home.tsx:181) + /reviews give document reviewers a pull surface via list_my_pending_reviews. The seed's submitted 幕牆物料報批 (MAT-001) would surface here for th
- [大地盤] Manpower/plant/weather AM-PM/warning-signals + 複製琴日. The seed's three dailies (晴 / 陰-雨 / 酷熱) carry trade headcounts, plant counts, and a 酷熱天氣警告 signal; seedFrom + 複製琴日 (DailyEdit.tsx:64) make repeat entry fast.
- [小型裝修] Escalation chain + numbering render seeded threads right: I-1 (worker->判頭 open), I-2 (判頭->總承建商 escalated), I-3 (老總->總承建商 resolved), I-4 (工程師->PM escalated). Good demo.
- [小型裝修] SI-001 locked (玻璃間隔, full MC->PM audit) + SI-002 in_review (電熱水爐) land in right filter pills; SI-001 drives VO-001. Clean SI->VO demo.
- [小型裝修] Realistic hot-work PTW-001 (風喉鋼支架燒焊): full 安全主任->PM chain, 5-item fire-watch checklist all ticked, 2 named workers, HK-day expiry. Exactly the hot-work a reno produces.
- [小型裝修] Rich daily: AM/PM weather + warning signals + manpower/plant + linked items + 複製琴日. Seed has 3 days incl. 黃雨 + 酷熱天氣警告. Good daily-cadence reno story.
- [小型裝修] MAT-001 地毯磚送審 (approved by PM) + MS-001 燒焊方法 (submitted, ties to hot-work PTW). Clean submit->review demo.
- [大樓維修] MS-001 approved-by-PM w/ note, DWG-001 submitted, document_events trail complete.

## 老總(general_foreman)

> **心聲**：我係地盤話事人，但起初好多模組當我透明 —— 寫唔到施工日誌、郁唔到問題單、入唔到物料貨，每個模組權限規則都唔同。呢個係我最大不滿，而家已經統一修好。

**🔴 唔順 / 壞咗（已修為主）：**
- [大地盤] Seeded dailies can't be reproduced by the labelled persona. Role: 老總 60001002. Two of three seeded dailies are authored by 60001002, but daily authoring is gated to global_role=main_contractor + sub_role in {fo
- [大地盤] canManageStructure contradicts its own doc comment for main_contractor. Role: MC/engineer. The interface comment (ProgressContext.tsx:14-19) says foreman/engineer/main_contractor do NOT get structural rights, b
- [大地盤] safety_officer and general_foreman reporters route via the default branch. getInitialHandler (types.ts:513) has no case for safety_officer or general_foreman; both fall through to return pm. Seed issue (c) — sa
- [大地盤] 老總 (general_foreman) cannot act on issues he did not report. canActOnIssue (IssuesContext.tsx:260) matches handler only for pm/main_contractor/ subcontractor (or admin, or reporter). A general_foreman viewing a
- [大地盤] general_foreman inconsistency vs SI/VO. DocumentsContext includes general_foreman in canManage/canIssue (:124,140) while SI/VO/PTW exclude it. Same role, different write rights per module (see sec 13). --- ## 8
- [大地盤] canManage includes general_foreman but the comment claims parity with SI/VO's narrower set. MaterialsContext.tsx:117 adds general_foreman to the membership-role list while the comment (:108) says admin OR assig
- [大地盤] Only main_contractor+foreman/engineer can author; PM and 老總 are locked out. canAuthor / upsertMyDaily require global_role=main_contractor + sub_role in {foreman,engineer} (DailyEdit.tsx:37, DailiesContext.tsx:1
- [大地盤] Read-only for everyone but admin/PM curators. ContactsContext comment (:77) notes 判頭/老總 are read-only. On a big site the 判頭 cannot add his own sub-trade contacts; only the curator can. Let members propose conta
- [大地盤] general_foreman (老總) write rights are inconsistent across modules. Same role, different gates: Progress structural and Documents INCLUDE it (membership role); Materials INCLUDES it (membership role); Weather IN
- [大地盤] Cross-project Dashboard is PM/admin-only; MC and 老總 are bounced. Dashboard shows only projects where the user is admin or in assigned_pm_ids, and redirects everyone else to /home (Dashboard.tsx:39,151). On a 大地
- [小型裝修] small_works allowedModes = [checklist,percentage] but seed uses quantity leaves the create UI cannot author Role: PM/老總 adding items. Files: progressTemplates.ts SMALL_WORKS.allowedModes; seed B.1/B.1.1/B.1.2/D
- [小型裝修] reporter role general_foreman missing from getInitialHandler switch -> defaults to pm, but seed I-3 placed it at main_contractor Files: types.ts getInitialHandler (no general_foreman case -> default pm); seed I
- [小型裝修] safety_officer + general_foreman cannot create an SI (canSubmit = pm/main_contractor/subcontractor) Role: 老總 60001002, safety 60000004. Files: SiContext.canSubmit. Scenario: on small reno the 老總 (top progress u
- [小型裝修] main_contractor (engineer) is NOT a material supervisor; can only mutate own rows Role: engineer 60001003. Files: MaterialList.tsx isSupervisor (admin|pm|general_foreman|assigned PM - NOT main_contractor); seed
- [小型裝修] Only main_contractor with sub_role foreman/engineer can author a daily; the 老總 (general_foreman) CANNOT write the log Role: general_foreman 60001002. Files: DailyEdit.tsx canAuthor = global_role===main_contract
- [小型裝修] Contacts admin/PM-curated (canManage); the 判頭/老總 who know the subbies are read-only Role: 判頭 60001005, 老總 60001002. Files: ContactsContext.canManage; seed contacts all created_by PM. Scenario: people with the r
- [小型裝修] Equipment ENTRY gated to admin/PM/main_contractor/safety_officer; the 判頭 (owns scaffold/hoist) + 老總 cannot reach 機械/表格 from 工具 tab Role: 判頭 60001005, 老總 60001002. Files: ToolsSwitcher.showEquipment. Scenario: o
- [小型裝修] Dashboard only shows admin or assigned_pm_ids projects; 判頭/老總/engineer/safety bounced to /home, no portfolio view Role: all except admin + assigned PM. Files: Dashboard.tsx visibleProjects filter + Navigate to

**🟢 用得好（demo 賣點）：**
- [小型裝修] Escalation chain + numbering render seeded threads right: I-1 (worker->判頭 open), I-2 (判頭->總承建商 escalated), I-3 (老總->總承建商 resolved), I-4 (工程師->PM escalated). Good demo.
- [小型裝修] Offline read cache on progress (cacheGet/cacheSet + refetch-on-reconnect). Relevant even for a Mong Kok office reno (lift-lobby dead zones). ## TOP ITEMS FOR REVIEW/DEMO 1. [BUG P1] 0.1 small_works 2 zones vs h

## 總承建商(main_contractor)

> **心聲**：我見到「加物料」個掣但入唔到貨（編輯權限同建立權限對唔上）；簽核鏈我有份但有陣時撳唔到。SI→VO 設計變更流程同金額自動計做得好。

**🔴 唔順 / 壞咗（已修為主）：**
- [大地盤] Seeded dailies can't be reproduced by the labelled persona. Role: 老總 60001002. Two of three seeded dailies are authored by 60001002, but daily authoring is gated to global_role=main_contractor + sub_role in {fo
- [大地盤] canManageStructure contradicts its own doc comment for main_contractor. Role: MC/engineer. The interface comment (ProgressContext.tsx:14-19) says foreman/engineer/main_contractor do NOT get structural rights, b
- [大地盤] 老總 (general_foreman) cannot act on issues he did not report. canActOnIssue (IssuesContext.tsx:260) matches handler only for pm/main_contractor/ subcontractor (or admin, or reporter). A general_foreman viewing a
- [大地盤] Claim editing is owner-locked (recorded_by = uid RLS). Both seed claims are recorded_by=60001001 (PM). The write gate sets recorded_by: profile.id and RLS requires recorded_by=uid (WeatherRecord.tsx:46,98), so
- [大地盤] canManage includes general_foreman but the comment claims parity with SI/VO's narrower set. MaterialsContext.tsx:117 adds general_foreman to the membership-role list while the comment (:108) says admin OR assig
- [大地盤] Only main_contractor+foreman/engineer can author; PM and 老總 are locked out. canAuthor / upsertMyDaily require global_role=main_contractor + sub_role in {foreman,engineer} (DailyEdit.tsx:37, DailiesContext.tsx:1
- [大地盤] Timetable write gate keys on GLOBAL role, unlike most modules. TimetablePage.tsx:92 checks profile.global_role, whereas SI/VO/PTW/materials/weather gate on the per-project membership role. A main_contractor glo
- [大地盤] Equipment entry is role-gated with no flag, unlike the rest. Comment at ProjectDetail.tsx:728 notes v55 ships forms_enabled=false but exposes NO get_forms_enabled RPC, so the entry is role-gated (admin/PM/main_
- [大地盤] Cross-project Dashboard is PM/admin-only; MC and 老總 are bounced. Dashboard shows only projects where the user is admin or in assigned_pm_ids, and redirects everyone else to /home (Dashboard.tsx:39,151). On a 大地
- [小型裝修] reporter role general_foreman missing from getInitialHandler switch -> defaults to pm, but seed I-3 placed it at main_contractor Files: types.ts getInitialHandler (no general_foreman case -> default pm); seed I
- [小型裝修] safety_officer reporter also missing from getInitialHandler -> routes to pm (silent default) Scenario: on a hot-work reno the safety officer most likely raises safety issues; they bypass 總承建商. Fix: add explicit
- [小型裝修] safety_officer + general_foreman cannot create an SI (canSubmit = pm/main_contractor/subcontractor) Role: 老總 60001002, safety 60000004. Files: SiContext.canSubmit. Scenario: on small reno the 老總 (top progress u
- [小型裝修] SI list/cards do not show WHO approves next until you open the SI Files: SiCard.tsx (步驟 n/n only, no role); SiList. Scenario: SI-002 in_review shows 步驟 1/2 but not that 總承建商 is current approver -> 判頭 cannot tel
- [小型裝修] main_contractor (engineer) is NOT a material supervisor; can only mutate own rows Role: engineer 60001003. Files: MaterialList.tsx isSupervisor (admin|pm|general_foreman|assigned PM - NOT main_contractor); seed
- [小型裝修] Only main_contractor with sub_role foreman/engineer can author a daily; the 老總 (general_foreman) CANNOT write the log Role: general_foreman 60001002. Files: DailyEdit.tsx canAuthor = global_role===main_contract
- [小型裝修] canAuthor requires a sub_role; a main_contractor with sub_role=null is blocked - and the seed never sets 60001003.sub_role Files: DailyEdit.tsx; seed resolves engineer by phone but does not set sub_role. Scenar
- [小型裝修] Contacts admin/PM-curated (canManage); the 判頭/老總 who know the subbies are read-only Role: 判頭 60001005, 老總 60001002. Files: ContactsContext.canManage; seed contacts all created_by PM. Scenario: people with the r
- [小型裝修] Equipment ENTRY gated to admin/PM/main_contractor/safety_officer; the 判頭 (owns scaffold/hoist) + 老總 cannot reach 機械/表格 from 工具 tab Role: 判頭 60001005, 老總 60001002. Files: ToolsSwitcher.showEquipment. Scenario: o

**🟢 用得好（demo 賣點）：**
- [小型裝修] Escalation chain + numbering render seeded threads right: I-1 (worker->判頭 open), I-2 (判頭->總承建商 escalated), I-3 (老總->總承建商 resolved), I-4 (工程師->PM escalated). Good demo.
- [小型裝修] Offline read cache on progress (cacheGet/cacheSet + refetch-on-reconnect). Relevant even for a Mong Kok office reno (lift-lobby dead zones). ## TOP ITEMS FOR REVIEW/DEMO 1. [BUG P1] 0.1 small_works 2 zones vs h
- [渠務] PTW list, filters, QR token, approval timeline, 簽名證明 cert all render. Seed active confined_space + in_review excavation list, filter by 生效中/簽核中; PTW-001 shows worker roster (陳大文/李志強), QR card, chain (safety_off
- [渠務] Permit chain safety_officer->main_contractor is seeded and honoured (matches 密閉空間 reality: safety signs first).
- [渠務] Daily captures 天氣(上晝/下晝)+警告信號+出勤(渠工/泥水/管工)+機械(挖掘機/泥頭車/抽水泵)+freeform. Seed 3 dailies (黃雨抽水/天氣好轉/酷熱遮蔭) are realistic 渠務 entries. Severe-signal red badge for 黑雨/紅雨/T8 works.

## 判頭(subcontractor)

> **心聲**：派俾我嘅工序我做到、更新到，但成個地盤睇唔到全貌（正常設計）。有啲明明係我落手做嘅工序，系統話我冇權記錄歷史。物料逾期清單一目了然。

**🔴 唔順 / 壞咗（已修為主）：**
- [大地盤] Floor-mode towers have no bulk "complete up to N/F". Role: 判頭/foreman. D.1/D.2/D.3 are 20-floor floors items; the grid (UpdateProgressModal.tsx:237) requires tapping each floor individually. Add "tick everythin
- [大地盤] 老總 (general_foreman) cannot act on issues he did not report. canActOnIssue (IssuesContext.tsx:260) matches handler only for pm/main_contractor/ subcontractor (or admin, or reporter). A general_foreman viewing a
- [大地盤] Escalation can dead-end with no 判頭 member. A worker-reported issue routes to subcontractor; with no approved subcontractor member, only admin or the reporter can move it (isReporter fallback at IssuesContext.ts
- [大地盤] Hot-work close-out is hidden until fire-watch + 30 min elapse. Role: 判頭. PTW-001 is active with fire_watch_started_at=null, so 關閉許可證 never appears until the user taps 開始 30 分鐘火警監察 AND a real 30-minute timer exp
- [大地盤] Read-only for everyone but admin/PM curators. ContactsContext comment (:77) notes 判頭/老總 are read-only. On a big site the 判頭 cannot add his own sub-trade contacts; only the curator can. Let members propose conta
- [大地盤] Equipment entry is role-gated with no flag, unlike the rest. Comment at ProjectDetail.tsx:728 notes v55 ships forms_enabled=false but exposes NO get_forms_enabled RPC, so the entry is role-gated (admin/PM/main_
- [小型裝修] safety_officer + general_foreman cannot create an SI (canSubmit = pm/main_contractor/subcontractor) Role: 老總 60001002, safety 60000004. Files: SiContext.canSubmit. Scenario: on small reno the 老總 (top progress u
- [小型裝修] SI list/cards do not show WHO approves next until you open the SI Files: SiCard.tsx (步驟 n/n only, no role); SiList. Scenario: SI-002 in_review shows 步驟 1/2 but not that 總承建商 is current approver -> 判頭 cannot tel
- [小型裝修] VO-002 is draft created by engineer; confirm the 判頭 (who prices the change) can submit Role: 判頭 60001005. Files: seed VO-002 created_by 60001003 status draft; VoContext canSubmit (mirrors SiContext). Scenario:
- [小型裝修] main_contractor (engineer) is NOT a material supervisor; can only mutate own rows Role: engineer 60001003. Files: MaterialList.tsx isSupervisor (admin|pm|general_foreman|assigned PM - NOT main_contractor); seed
- [小型裝修] Contacts admin/PM-curated (canManage); the 判頭/老總 who know the subbies are read-only Role: 判頭 60001005, 老總 60001002. Files: ContactsContext.canManage; seed contacts all created_by PM. Scenario: people with the r
- [小型裝修] Equipment ENTRY gated to admin/PM/main_contractor/safety_officer; the 判頭 (owns scaffold/hoist) + 老總 cannot reach 機械/表格 from 工具 tab Role: 判頭 60001005, 老總 60001002. Files: ToolsSwitcher.showEquipment. Scenario: o
- [小型裝修] Documents surface ALSO requires global files_enabled flag; if off, non-admins see NO 文件 card despite all-modules-on + seeded docs Role: PM/判頭. Files: ToolsSwitcher.showFiles = (filesEnabled || admin) and isModu
- [小型裝修] Dashboard only shows admin or assigned_pm_ids projects; 判頭/老總/engineer/safety bounced to /home, no portfolio view Role: all except admin + assigned PM. Files: Dashboard.tsx visibleProjects filter + Navigate to
- [渠務] Cannot create 密閉空間 (confined_space) or 掘地 (excavation) permits from the UI. Role: 判頭/safety_officer/main_contractor. PTW_TYPE_V1 = [hot_work,work_at_height,lifting] (src/types.ts:979); PtwSubmitForm disables ev
- [渠務] Seed-authored progress_history for D.1 attributed to 判頭(60001005), but app gates progress writes to supervisors. Seed two history ticks set updated_by=60001005 (subcontractor, lines 333/336). canManageStructure
- [渠務] CLAUDE.md documents canEdit=[pm,main_contractor,subcontractor] but code uses [pm,general_foreman,main_contractor]. Doc/code drift; subcontractor swapped for general_foreman. Confirm intended set for 判頭-heavy 渠務
- [渠務] safety_officer cannot be a handler and cannot act on safety issues they did not report. Role: safety_officer (60000004). IssueHandlerRole enum is pm|main_contractor|subcontractor|admin (src/types.ts:452) — no s

**🟢 用得好（demo 賣點）：**
- [小型裝修] Escalation chain + numbering render seeded threads right: I-1 (worker->判頭 open), I-2 (判頭->總承建商 escalated), I-3 (老總->總承建商 resolved), I-4 (工程師->PM escalated). Good demo.
- [小型裝修] Four lifecycle states (arrived / 50-90 partial / future / overdue 電熱水爐) + item links + 逾期 chip/filter. Exactly the where-is-my-料 view a 判頭 needs.
- [渠務] The worker->判頭->總承建 escalation on issue #1 (未標示電纜) is a textbook 渠務 demo. Comment trail (停工圍封->判頭上報->總承建約中電驗線) renders fully in IssueDetail.
- [渠務] SI-001(locked, 遇岩石)->VO-001(破碎機計價) chain is the strongest commercial demo. SiDetail shows the locked SI, 就此工地指令提出變更指令 button, related VO link, 抗議 tab (seed has 判頭 protest re: night-work permit). VO line items (
- [渠務] Address book fits 渠務 supply chain. Seed: 陳師傅(渠務判頭), 黃工(喉管供應), 中電工程組 CLP(地下電纜驗線). The CLP contact directly supports the issue #1 narrative — 一鍵打電話 to CLP. Trade-tagged.

## 工人(worker)

> **心聲**：我淨係見到派俾我嗰幾條細項，影相報問題好直接、好快。但一開始根本冇人派嘢俾我，入到去白茫茫一片乜都做唔到 —— 已經派咗工序俾我。

**🔴 唔順 / 壞咗（已修為主）：**
- [大地盤] Worker persona is fully read-only on progress (nothing assigned). Role: worker 60001006. The seed never sets assigned_to / delegated_to on any of the 50 progress_items (omitted from every INSERT in seed-big-sit
- [大地盤] Contributors can update a leaf but cannot see its 歷史 / 指派. The 歷史 and 指派 menu rows are gated on canEdit (ProgressItemCard.tsx:291-295), so an assigned judhead worker who can tick progress cannot review the item
- [大地盤] Escalation can dead-end with no 判頭 member. A worker-reported issue routes to subcontractor; with no approved subcontractor member, only admin or the reporter can move it (isReporter fallback at IssuesContext.ts
- [大地盤] Equipment entry is role-gated with no flag, unlike the rest. Comment at ProjectDetail.tsx:728 notes v55 ships forms_enabled=false but exposes NO get_forms_enabled RPC, so the entry is role-gated (admin/PM/main_
- [小型裝修] assigned worker can set/clear 受阻 via the same UpdateProgressModal Role: worker 60001006. Files: ProgressContext.canUpdateItem; UpdateProgressModal.save calls setBlocked. Scenario: worker assigned B.1 opens 更新 -
- [小型裝修] permit_workers store login phones (60001006/60001007) as free-text; not FK to user_profiles Scenario: 60001007 is not a persona; workers are not linked to accounts (QR/credential checks will not tie to them). F
- [渠務] No confined-space exit/sign-out gate at close-out. Non-hot_work shows a bare 關閉許可證 button (PtwDetail.tsx:194-201); there is no all-workers-accounted-for gate before closing PTW-001.
- [渠務] No 密閉空間/掘地-specific safety lane in escalation. Seed issue #1 (CH150 未標示電纜) correctly walks worker->判頭->總承建. But a stop-work safety issue (護土板鬆動 #4) routes the same generic chain as cosmetic ones — no fast-path
- [渠務] Non-admin members (老總/判頭/管工/工人/safety) cannot reach the cross-site Dashboard. visibleProjects for non-admin = only assigned_pm_ids.includes(uid) (Dashboard.tsx:39-43); the route also redirects non-PM/non-admin
- [大樓維修] ] general_foreman 老總 & safety_officer have NO issue-chain authority: getInitialHandler (types.ts:513) has no case for them (→default 'pm'); canActOnIssue (IssuesContext.tsx:260) grants only admin/pm/main_contra
- [大樓維修] ] PtwDetail 簽核紀錄 hidden (approvals.length===0) — seed has permit+version+3 workers but no approvals/permit_signoffs; safety_officer-in-chain signature never shown.
- [大樓維修] ] EquipmentVerify shows 去簽署 to any member, but target EquipmentDetail disables 簽署 without competent_person credential → worker scanning expired 吊船 hits a dead button. Fix: only show 去簽署 to credentialed users /

**🟢 用得好（demo 賣點）：**
- [小型裝修] get_visible_progress_items RPC scopes tree by role; worker 60001006 (assigned B.1 + children) only sees their items in progress + daily picker. Good least-privilege.
- [小型裝修] Escalation chain + numbering render seeded threads right: I-1 (worker->判頭 open), I-2 (判頭->總承建商 escalated), I-3 (老總->總承建商 resolved), I-4 (工程師->PM escalated). Good demo.
- [小型裝修] Realistic hot-work PTW-001 (風喉鋼支架燒焊): full 安全主任->PM chain, 5-item fire-watch checklist all ticked, 2 named workers, HK-day expiry. Exactly the hot-work a reno produces.
- [渠務] PTW list, filters, QR token, approval timeline, 簽名證明 cert all render. Seed active confined_space + in_review excavation list, filter by 生效中/簽核中; PTW-001 shows worker roster (陳大文/李志強), QR card, chain (safety_off
- [渠務] The worker->判頭->總承建 escalation on issue #1 (未標示電纜) is a textbook 渠務 demo. Comment trail (停工圍封->判頭上報->總承建約中電驗線) renders fully in IssueDetail.
- [大樓維修] work_at_height checklist HK-accurate (全身式安全帶/獨立救生繩, 綠色合格牌棚紙, 無風球/暴雨, 工具繫繩) + worker list + active QR.

## 安全主任(safety_officer)

> **心聲**：動火、高空、吊運證 OK，QR 掃描同簽名證明好正。但密閉空間/掘地證起初開唔到（渠務地盤就係靠呢兩款）+ 氣體測試 O2/H2S/CO/LEL 睇唔到；安全問題我淨係留到言，郁唔到。全部已修。

**🔴 唔順 / 壞咗（已修為主）：**
- [大地盤] safety_officer and general_foreman reporters route via the default branch. getInitialHandler (types.ts:513) has no case for safety_officer or general_foreman; both fall through to return pm. Seed issue (c) — sa
- [大地盤] Equipment entry is role-gated with no flag, unlike the rest. Comment at ProjectDetail.tsx:728 notes v55 ships forms_enabled=false but exposes NO get_forms_enabled RPC, so the entry is role-gated (admin/PM/main_
- [小型裝修] safety_officer reporter also missing from getInitialHandler -> routes to pm (silent default) Scenario: on a hot-work reno the safety officer most likely raises safety issues; they bypass 總承建商. Fix: add explicit
- [小型裝修] safety_officer + general_foreman cannot create an SI (canSubmit = pm/main_contractor/subcontractor) Role: 老總 60001002, safety 60000004. Files: SiContext.canSubmit. Scenario: on small reno the 老總 (top progress u
- [小型裝修] Equipment ENTRY gated to admin/PM/main_contractor/safety_officer; the 判頭 (owns scaffold/hoist) + 老總 cannot reach 機械/表格 from 工具 tab Role: 判頭 60001005, 老總 60001002. Files: ToolsSwitcher.showEquipment. Scenario: o
- [小型裝修] Form signer (safety_officer) has no seeded credential -> the sign-on-your-phone flow may reject Role: safety 60000004. Files: seed form_instances.assigned_signer_id=60000004; record_form_signoff credential gate
- [渠務] Cannot create 密閉空間 (confined_space) or 掘地 (excavation) permits from the UI. Role: 判頭/safety_officer/main_contractor. PTW_TYPE_V1 = [hot_work,work_at_height,lifting] (src/types.ts:979); PtwSubmitForm disables ev
- [渠務] PtwDetail never renders the confined-space gas test, hazards, or controls. Role: safety_officer/approver. PtwDetailInner renders only payload.description + payload.checklist (src/pages/PtwDetail.tsx:120-141). T
- [渠務] safety_officer cannot be a handler and cannot act on safety issues they did not report. Role: safety_officer (60000004). IssueHandlerRole enum is pm|main_contractor|subcontractor|admin (src/types.ts:452) — no s
- [渠務] No 密閉空間/掘地-specific safety lane in escalation. Seed issue #1 (CH150 未標示電纜) correctly walks worker->判頭->總承建. But a stop-work safety issue (護土板鬆動 #4) routes the same generic chain as cosmetic ones — no fast-path
- [渠務] 老總 (general_foreman) and 判頭 cannot write the daily log. Role: 老總 60001002 / 判頭 60001005. canAuthor requires global_role==main_contractor AND sub_role foreman/engineer (DailyList.tsx:53-56). On a 渠務 site the 老總
- [渠務] general_foreman + safety_officer are first-class global roles but second-class downstream (no issue handler slot, no daily authoring, no dashboard, partial materials). These are exactly the roles a 渠務 site lean
- [大樓維修] ] Statutory-form signing undemoable: form_templates CSSR-F5/SWP-WEEKLY/LALG-F1 all required_credential='competent_person' (v55), but seed creates ZERO user_credentials. EquipmentDetail.tsx gates 簽署 on hasMatchi
- [大樓維修] ] general_foreman 老總 & safety_officer have NO issue-chain authority: getInitialHandler (types.ts:513) has no case for them (→default 'pm'); canActOnIssue (IssuesContext.tsx:260) grants only admin/pm/main_contra
- [大樓維修] ] safety_officer can't action safety issue #1 (棚架護網鬆脫 安全隱患) — only comment. Fix: grant安全主任 resolve rights on open issues.
- [大樓維修] ] PtwDetail 簽核紀錄 hidden (approvals.length===0) — seed has permit+version+3 workers but no approvals/permit_signoffs; safety_officer-in-chain signature never shown.
- [大樓維修] ] Non-PM members get NO Dashboard: Dashboard.tsx:151 redirects unless admin/assigned-PM; 老總/MC/判頭/安全主任 never get cross-site rollup. Fix: scoped dashboard for MC/老總.

**🟢 用得好（demo 賣點）：**
- [大地盤] Full statutory checklist + QR + signature proof. Hot-work checklist (滅火器/火警監察員/11m 清空), lifting checklist (吊運計劃/CHIT/banksman/風速), per-signoff 簽名證明 cards, and the 3-step MC->safety_officer->PM chain (seed sec 4
- [小型裝修] Realistic hot-work PTW-001 (風喉鋼支架燒焊): full 安全主任->PM chain, 5-item fire-watch checklist all ticked, 2 named workers, HK-day expiry. Exactly the hot-work a reno produces.
- [渠務] PTW list, filters, QR token, approval timeline, 簽名證明 cert all render. Seed active confined_space + in_review excavation list, filter by 生效中/簽核中; PTW-001 shows worker roster (陳大文/李志強), QR card, chain (safety_off
- [渠務] Permit chain safety_officer->main_contractor is seeded and honoured (matches 密閉空間 reality: safety signs first).
- [渠務] Document register with versions + review states fits 渠務 submittals. Seed: MAT-001 (HDPE 600mm 報批, v1 superseded 缺ISO證書 -> v2 approved), MS-001 (密閉空間作業方法聲明, v1 submitted by safety_officer). The supersede/approve

## 業主(owner)

> **心聲**：我多數唔開 app，淨係收 PM send 嗰張一頁紙報告，唯讀，10 秒睇得明，啱使。睇唔到內部細節係刻意嘅。EOT 工期延誤申索改唔到（淨係記錄者改到）。

**🔴 唔順 / 壞咗（已修為主）：**
- [大地盤] Claim editing is owner-locked (recorded_by = uid RLS). Both seed claims are recorded_by=60001001 (PM). The write gate sets recorded_by: profile.id and RLS requires recorded_by=uid (WeatherRecord.tsx:46,98), so
- [小型裝修] small-works KPI tile kind is defined but never rendered (dead config) Files: progressTemplates.ts (SMALL_WORKS.kpiTiles=small-works); ProjectDetail.tsx only special-cases isMaintenance. Scenario: maintenance ge
- [小型裝修] main_contractor (engineer) is NOT a material supervisor; can only mutate own rows Role: engineer 60001003. Files: MaterialList.tsx isSupervisor (admin|pm|general_foreman|assigned PM - NOT main_contractor); seed
- [小型裝修] owner (業主) is not a seeded member though G.3 業主驗收及交收 exists; the read-only owner view + handover sign-off is untested here Files: seed project_members (6 roles, NO owner); types.ts owner read-only. Scenario: re
- [渠務] VO chain step 2 = owner, but the seed project has no owner member. VO chain mc->pm->owner (seed line 451); no owner persona is a member. VO-001 advances mc->pm then dead-ends at owner — approver bar shows 等待 業主

**🟢 用得好（demo 賣點）：**
- [渠務] 受阻 (blocked) status with reason is a great drainage fit. B.3 大涌橋路 blocked reason 等待業主提供地下管線竣工圖; toggle reasons 雨天/地下水/掘路紙/物料/其他 (UpdateProgressModal.tsx:11) match 渠務 stoppages. Card shows amber 受阻 chip. Demo th
- [渠務] SI-001(locked, 遇岩石)->VO-001(破碎機計價) chain is the strongest commercial demo. SiDetail shows the locked SI, 就此工地指令提出變更指令 button, related VO link, 抗議 tab (seed has 判頭 protest re: night-work permit). VO line items (
- [渠務] VO PDF export embeds Noto Sans HK so 破碎機/棄置 line items print in Chinese — credible for an owner-facing 渠務 變更 claim. ## 6. 物料 Materials (overdue 沙井 delivery)
- [大樓維修] maintenance-apt trades: 註冊棚廠/永泰防水/安泰機電(EMSD)/業主立案法團(管理處) — 法團 contact is right HK touch for 停水審批; one-tap-call.

## admin

> **心聲**：我開盤、設分區、派 PM、開關 13 個模組，權限最大。痛點：防篡改審計 proof 喺手機（Capacitor）匯出㩒咗冇反應；關咗某模組之後，有啲地方（如 Dashboard 問題數）靜靜少計冇提示。已修。

**🔴 唔順 / 壞咗（已修為主）：**
- [大地盤] 老總 (general_foreman) cannot act on issues he did not report. canActOnIssue (IssuesContext.tsx:260) matches handler only for pm/main_contractor/ subcontractor (or admin, or reporter). A general_foreman viewing a
- [大地盤] Escalation can dead-end with no 判頭 member. A worker-reported issue routes to subcontractor; with no approved subcontractor member, only admin or the reporter can move it (isReporter fallback at IssuesContext.ts
- [大地盤] Claim editing is owner-locked (recorded_by = uid RLS). Both seed claims are recorded_by=60001001 (PM). The write gate sets recorded_by: profile.id and RLS requires recorded_by=uid (WeatherRecord.tsx:46,98), so
- [大地盤] Documents module is flag-gated (files_enabled) — invisible to non-admins unless the flag is on. ToolsSwitcher.showFiles and Sidebar both require filesEnabled || admin (ProjectDetail.tsx:723, Sidebar.tsx:26). Fo
- [大地盤] canManage includes general_foreman but the comment claims parity with SI/VO's narrower set. MaterialsContext.tsx:117 adds general_foreman to the membership-role list while the comment (:108) says admin OR assig
- [大地盤] Read-only for everyone but admin/PM curators. ContactsContext comment (:77) notes 判頭/老總 are read-only. On a big site the 判頭 cannot add his own sub-trade contacts; only the curator can. Let members propose conta
- [大地盤] Equipment entry is role-gated with no flag, unlike the rest. Comment at ProjectDetail.tsx:728 notes v55 ships forms_enabled=false but exposes NO get_forms_enabled RPC, so the entry is role-gated (admin/PM/main_
- [大地盤] Cross-project Dashboard is PM/admin-only; MC and 老總 are bounced. Dashboard shows only projects where the user is admin or in assigned_pm_ids, and redirects everyone else to /home (Dashboard.tsx:39,151). On a 大地
- [小型裝修] autoZone hides zones in 進度 but Dashboard + export still expose "N 個分區" Role: PM/admin. Files: Dashboard.tsx (~214 leafCount 個 leaf, project.zones.length 個分區); export.ts + ExportProgressModal (groupByZone uses p
- [小型裝修] main_contractor (engineer) is NOT a material supervisor; can only mutate own rows Role: engineer 60001003. Files: MaterialList.tsx isSupervisor (admin|pm|general_foreman|assigned PM - NOT main_contractor); seed
- [小型裝修] Contacts admin/PM-curated (canManage); the 判頭/老總 who know the subbies are read-only Role: 判頭 60001005, 老總 60001002. Files: ContactsContext.canManage; seed contacts all created_by PM. Scenario: people with the r
- [小型裝修] Equipment ENTRY gated to admin/PM/main_contractor/safety_officer; the 判頭 (owns scaffold/hoist) + 老總 cannot reach 機械/表格 from 工具 tab Role: 判頭 60001005, 老總 60001002. Files: ToolsSwitcher.showEquipment. Scenario: o
- [小型裝修] Documents surface ALSO requires global files_enabled flag; if off, non-admins see NO 文件 card despite all-modules-on + seeded docs Role: PM/判頭. Files: ToolsSwitcher.showFiles = (filesEnabled || admin) and isModu
- [小型裝修] Dashboard only shows admin or assigned_pm_ids projects; 判頭/老總/engineer/safety bounced to /home, no portfolio view Role: all except admin + assigned PM. Files: Dashboard.tsx visibleProjects filter + Navigate to
- [渠務] zoneNoun 路段 / labelNoun 工序 only relabels copy; zones still admin-defined free strings. Drainage zones are chainages (CH0-CH120) but the create-item floors generator still says 樓層數 / 起始(負為地庫) — meaningless for 路
- [渠務] safety_officer cannot be a handler and cannot act on safety issues they did not report. Role: safety_officer (60000004). IssueHandlerRole enum is pm|main_contractor|subcontractor|admin (src/types.ts:452) — no s
- [渠務] Two supervisor gates on the same screen disagree. Role: main_contractor (60001003). MaterialsContext.canManage (FAB/create) grants membership roles [pm,main_contractor,general_foreman,subcontractor] (MaterialsC
- [渠務] 文件 module is flag-gated (files_enabled) AND module-gated. ToolsSwitcher.showFiles needs (filesEnabled||admin) AND isModuleEnabled(documents) (ProjectDetail.tsx:723). If files_enabled is off in app_config, the 渠

**🟢 用得好（demo 賣點）：**
- [小型裝修] Offline read cache on progress (cacheGet/cacheSet + refetch-on-reconnect). Relevant even for a Mong Kok office reno (lift-lobby dead zones). ## TOP ITEMS FOR REVIEW/DEMO 1. [BUG P1] 0.1 small_works 2 zones vs h

---

## 修復狀態
本 session 已修復絕大部分 🔴 意見（app code + v66/v67 RLS/cron + seed 資料），詳見 SIMULATION-REPORT.md 同 git log（dede112 / d086caa）。少數刻意保留（業主唯讀、權限分層、territory-wide 天氣）已標明。原始逐項 + file:line 證據喺 findings-{big-site,small-reno,drainage,maintenance}.md。
