# Findings Register — 大地盤 / 新建大樓 (project type `general`)

Static role-based review of the live app source + the seeded demo project
[DEMO] 大型新建大樓 — 觀塘商住發展項目 (d0000001-0001-0001-0001-000000000001, 50 progress
items, full baseline across all 13 modules). No network used — every item cites a
file + a concrete scenario in this project type's context.

Personas (all test1234): admin 60000099, PM 60001001, main_contractor/engineer
60001003, general_foreman/老總 60001002, subcontractor/判頭 60001005, worker
60001006, safety_officer 60000004.

Tags: [BUG] defect, [UX] friction, [MISSING] absent capability, [GOOD] demo-positive.
Severity: S1 (blocker) to S4 (cosmetic).

---

## 0. Seed-data integrity (affects every module's demo)

- [BUG] S1 — Worker persona is fully read-only on progress (nothing assigned).
  Role: worker 60001006. The seed never sets assigned_to / delegated_to on any of the
  50 progress_items (omitted from every INSERT in seed-big-site.sql; default []).
  ProgressContext.canUpdateItem (src/contexts/ProgressContext.tsx:104) returns true
  only for supervisors OR when assigned_to/delegated_to contains the user. Net effect:
  the 判頭工人 opens the deep tree but the 更新 button never appears on any leaf — the
  "worker ticks progress" demo path is dead. Fix: seed assigned_to on a few live
  leaves (T1/T2 floor items, 幕牆掛板) to 60001006.

- [BUG] S3 — In-review SI/VO/PTW have an empty 簽核紀錄 timeline. Role: PM/MC reviewers.
  SI-002, VO-002, PTW-002 are seeded straight to current_step=1, status=in_review with
  NO step-0 approvals row (seed-big-site.sql sec 5/6/7). Detail pages render the
  approval timeline from the approvals ledger (VoDetail.tsx:78, PtwDetail.tsx:204,
  SiTimeline), so the first approver's action is invisible — a reviewer sees a blank
  history and may think the chain skipped a step. Fix: seed a step-0 approve row per
  in-review doc.

- [UX] S3 — Seeded dailies can't be reproduced by the labelled persona. Role: 老總
  60001002. Two of three seeded dailies are authored by 60001002, but daily authoring
  is gated to global_role=main_contractor + sub_role in {foreman,engineer}
  (DailiesContext.tsx:164). If 60001002's global role is general_foreman, those rows
  were inserted via SQL (bypassing RLS) and the persona could never create/edit them
  in-app. Verify the persona's real global_role/sub_role; align the seed author with
  the gate. (See sec 9.)

- [GOOD] Rich, realistic baseline. 8 大項 -> 中項 -> 細項 with mixed tracking modes
  (percentage/floors/quantity), blocked item tied to SI-002, overdue material tied to a
  fire-pump leaf, locked SI->VO chain, active 動火證 with fire-watch, expired + expiring
  statutory forms, 2 EOT weather claims. Excellent for a guided demo.

---

## 1. 進度 (Progress tree, rollup)

- [GOOD] Deep 大項->中項->細項 rollup with schedule variance. computeRollup
  (types.ts:407) excludes un-scheduled leaves from the planned average so parents do
  not falsely read 超前; quantity-mode branches weight by qty_total. Zone roll-ups +
  per-item +/-% vs plan render cleanly.

- [BUG] S2 — canManageStructure contradicts its own doc comment for main_contractor.
  Role: MC/engineer. The interface comment (ProgressContext.tsx:14-19) says
  foreman/engineer/main_contractor do NOT get structural rights, but the code grants it
  to membership role main_contractor (:99). Because the seed gives engineer 60001003
  AND 老總 60001002 the main_contractor membership role, both can add/delete/reassign
  大項 — surprising vs the documented supervisor-tier-only. Reconcile comment vs code.

- [UX] S3 — Deep tree is cramped on a 390px phone. Indent is (level-1)*0.85rem
  (ProgressItemCard.tsx:160); each row packs code + repeated zone badge + title + mode
  chip + bar + %/variance + status pill + 更新 button. At level 3 (細項) on the 大地盤 this
  truncates the title. Hide the zone badge on inherited children and/or denser L3.

- [UX] S3 — Zone badge repeats on every descendant. zoneLabel renders on every card
  (ProgressItemCard.tsx:213) even though L2/L3 inherit the parent's zone -> visual
  noise. Show zone only on L1 / when it differs from parent.

- [UX] S3 — Floor-mode towers have no bulk "complete up to N/F". Role: 判頭/foreman.
  D.1/D.2/D.3 are 20-floor floors items; the grid (UpdateProgressModal.tsx:237)
  requires tapping each floor individually. Add "tick everything <= this floor".

- [UX] S4 — No contiguity guard on floors. You can tick 9/F done while 8/F is not
  (UpdateProgressModal.toggleFloor). Impossible for structural floors; a soft warning
  would catch fat-finger entry.

- [UX] S3 — Contributors can update a leaf but cannot see its 歷史 / 指派. The 歷史 and
  指派 menu rows are gated on canEdit (ProgressItemCard.tsx:291-295), so an assigned
  judhead worker who can tick progress cannot review the item history. Expose read-only
  歷史 to canUpdateThis.

- [UX] S4 — Level border colour stops at L2. LEVEL_BORDER (ProgressItemCard.tsx:55)
  styles only levels 1-2; L3 細項 fall back to grey, flattening hierarchy where the 大地盤
  tree is deepest.

- [GOOD] Blocked-reason surfacing. D.5 後加鋼結構天幕 carries status=blocked + reason tied
  to SI-002; displayStatusOf forces 受阻 in the card. Clean design-change stoppage demo.

---

## 2. 問題 (Issues + escalation chain)

- [BUG] S2 — safety_officer and general_foreman reporters route via the default branch.
  getInitialHandler (types.ts:513) has no case for safety_officer or general_foreman;
  both fall through to return pm. Seed issue (c) — safety_officer reports 塔吊司機證即將到期
  -> handler pm — works only by accident of the default. If routing intent changes it
  silently misroutes. Add explicit cases.

- [BUG] S2 — 老總 (general_foreman) cannot act on issues he did not report.
  canActOnIssue (IssuesContext.tsx:260) matches handler only for pm/main_contractor/
  subcontractor (or admin, or reporter). A general_foreman viewing any handler-assigned
  open issue gets no escalate/resolve buttons — the supervisory 老總 is a bystander.
  Decide whether 老總 inherits MC/PM authority.

- [UX] S3 — Escalation can dead-end with no 判頭 member. A worker-reported issue routes
  to subcontractor; with no approved subcontractor member, only admin or the reporter
  can move it (isReporter fallback at IssuesContext.tsx:271). The seed has 判頭 60001005
  so the demo is fine, but the dead-end is real for sparse teams.

- [UX] S3 — Issues carry no zone/leaf link. Issue has free-text location only
  (types.ts:471); it cannot tie to a progress leaf or zone. On a 6-zone 大地盤 you cannot
  jump from the issue to D.2 or filter issues by zone. Add an optional progress_item_id.

- [GOOD] Audit-trail comments with from/to role. Every escalation writes an
  issue_comments row with from_role/to_role (seed sec 3); the 處理紀錄 export resolves
  actor names via get_issue_actor_profiles. Good dispute story.

---

## 3. 工地指令 SI (Site Instructions)

- [MISSING] S2 — SI list has no forward link to its derived VO. Role: PM/MC. The SI->VO
  design-change chain is core to the 大地盤 narrative (SI-001 spawned VO-001), but
  SiList/SiCard never shows 已衍生 VO-001. The relationship lives only in
  variation_orders.si_id; only the VO side shows the back-reference (VoDetail.tsx:176).
  Add a derived-VO badge/link on the SI card+detail.

- [BUG] S3 — approvals/protest_comments fetched without a project filter.
  SiContext.refetch (:82-83) selects approvals by doc_type=si and ALL protest_comments
  with no project_id predicate, relying purely on RLS to scope. On a multi-project org
  this loads every visible SI approval across projects into approvalsBySi (correctness
  depends entirely on RLS; also a growth/perf concern). Scope by the project's SI ids
  like si_versions already does.

- [UX] S3 — SI status filters do not expose draft. SiList FILTERS (:10) are
  all/待批准/已批准/已退回/已拒絕 — no 草稿 bucket, so a creator's own unsubmitted drafts only
  appear under 全部.

- [GOOD] Server-authored approve-with-edits. approve_with_edits goes through
  submit_approval only (SiContext.tsx:173), writing the new si_versions row in the same
  txn as the approval — no client-side two-write race.

---

## 4. 變更指令 VO (Variation Orders, HKD)

- [GOOD] Server-computed total + parent-SI citation. VO total from sync_vo_total; VoDetail
  shows 經系統核算總額 and 引用工地指令 SI-001 (VoDetail.tsx:281,176). VO-001 (機房防水托盤
  from SI-001) and standalone VO-002 (弧形天幕) read well in HKD.

- [GOOD] Delegation-aware approver gate. VoApproverBar.isRoleHolder (:79) mirrors
  active_role_holders incl. the delegation branch, so the UI shows 批准/退回/拒絕 only to a
  real role holder (or their delegate).

- [UX] S3 — VO total ignores the source SI's locked status visually. VO-002 hangs off
  SI-002 which is still in_review; nothing on the VO warns the parent SI is not yet
  approved/locked. Surface the parent SI status on the VO.

- [UX] S4 — VO total has no per-category subtotal. VO-002 mixes 鋼結構 (38 噸) + 設計 — only
  a grand total shows. A category subtotal would help the PM sanity-check a six-figure VO.

---

## 5. 工作許可證 PTW (動火 / 高空 / 吊運 + safety officer)

- [BUG] S2 — No client-side expired derivation; an over-time permit still reads 生效中.
  PTW-001 is seeded to expire at end of today HKT (seed-big-site.sql:740). Nothing in
  ptw.ts or PtwDetail.tsx/PtwCard.tsx flips an active permit to expired once expires_at
  passes (CLAUDE.md says derive expired client-side from valid_to, but it is not done).
  After end of day the demo permit still shows 生效中, still mints a QR (PtwDetail.tsx:40),
  and the 已過期 list filter (PtwList.tsx:18) stays empty. Add a derived-status helper used
  by card/detail/filter.

- [BUG] S3 — Expired-by-time permit shows 即將到期 instead of 已過期. PtwCard.isExpiring is
  expires_at - now < 1h (PtwCard.tsx:35), also true for a NEGATIVE remainder, so a permit
  5 minutes past expiry renders the amber 即將到期 warning rather than a red expired state.

- [UX] S2 — Hot-work close-out is hidden until fire-watch + 30 min elapse. Role: 判頭.
  PTW-001 is active with fire_watch_started_at=null, so 關閉許可證 never appears until the
  user taps 開始 30 分鐘火警監察 AND a real 30-minute timer expires (hotWorkFireWatchEligible,
  ptw.ts:145; gate at PtwDetail.tsx:185). For a live demo you cannot close the 動火證
  without a 30-minute wait. Consider a demo override or surfacing the requirement up front.

- [UX] S3 — Expiry shows time only, no date. formatExpiry (PtwCard.tsx:27) prints HH:mm —
  ambiguous for a multi-day permit; the detail page does show the full datetime.

- [GOOD] Full statutory checklist + QR + signature proof. Hot-work checklist
  (滅火器/火警監察員/11m 清空), lifting checklist (吊運計劃/CHIT/banksman/風速), per-signoff
  簽名證明 cards, and the 3-step MC->safety_officer->PM chain (seed sec 4/7) make PTW the
  strongest compliance demo in the app.

---

## 6. 天氣記錄 (Weather / EOT)

- [GOOD] Live HKO events + per-project EOT claims + CEDD-form export. Seed has
  black-rain+78mm and a T8 day, each with a project_weather_claims row (critical-path,
  tidy-days, claim-days, note). WeatherRecord joins events to claims by date and exports
  Excel/PDF. Excellent EOT-dispute story.

- [BUG] S3 — Claim editing is owner-locked (recorded_by = uid RLS). Both seed claims are
  recorded_by=60001001 (PM). The write gate sets recorded_by: profile.id and RLS requires
  recorded_by=uid (WeatherRecord.tsx:46,98), so a main_contractor manager opening the same
  claim cannot save edits — only the original recorder (or admin). Surface ownership or
  relax to any project manager.

- [UX] S4 — EOT total sums all claims regardless of critical path. totalDays
  (WeatherRecord.tsx:75) adds every claim_days; a non-critical weather day still inflates
  the headline EOT figure. Show critical-path days separately.

---

## 7. 文件 (Documents register)

- [GOOD] Cross-project 待我審批 inbox on Home. PendingReviewsTile (Home.tsx:181) + /reviews
  give document reviewers a pull surface via list_my_pending_reviews. The seed's submitted
  幕牆物料報批 (MAT-001) would surface here for the PM.

- [UX] S2 — Documents module is flag-gated (files_enabled) — invisible to non-admins
  unless the flag is on. ToolsSwitcher.showFiles and Sidebar both require
  filesEnabled || admin (ProjectDetail.tsx:723, Sidebar.tsx:26). For the demo a PM/MC
  persona will not see the 文件 card unless the app_config flag is on — confirm it is
  enabled or the seeded MS-001/MAT-001 documents are unreachable in-app for them.

- [UX] S3 — general_foreman inconsistency vs SI/VO. DocumentsContext includes
  general_foreman in canManage/canIssue (:124,140) while SI/VO/PTW exclude it. Same role,
  different write rights per module (see sec 13).

---

## 8. 物料 (Materials)

- [GOOD] Generated status + client-derived 逾期 + leaf linkage. Seed shows arrived
  (T40 鋼筋), partial (C45 混凝土 520/850), future (幕牆板, AHU), and an overdue 消防泵組 tied to
  leaf F.2 — isMaterialLate (MaterialsContext.tsx:53) flags the overdue one. 需用物料 shows
  on the linked leaf card.

- [BUG] S3 — canManage includes general_foreman but the comment claims parity with SI/VO's
  narrower set. MaterialsContext.tsx:117 adds general_foreman to the membership-role list
  while the comment (:108) says admin OR assigned PM OR approved membership in
  pm|main_contractor|sub. Reconcile comment vs role list and align with what RLS allows.

- [UX] S3 — receiveMaterial cannot correct an over-receive. qty must be > 0 (:206) and is
  always ADDED; no way to subtract an erroneous 入貨 entry except editing qty_needed.

- [UX] S4 — No partial-arrival timestamp trail. arrived_at is stamped only when fully
  arrived (:209); the C45 混凝土 partial deliveries (520 of 850) lose their per-delivery
  dates. A receipts log would aid the audit trail.

---

## 9. 每日日誌 (Daily logs)

- [BUG] S2 — Only main_contractor+foreman/engineer can author; PM and 老總 are locked out.
  canAuthor / upsertMyDaily require global_role=main_contractor + sub_role in
  {foreman,engineer} (DailyEdit.tsx:37, DailiesContext.tsx:164). On a 大地盤 the PM 60001001
  and 老總 60001002 (if general_foreman global role) cannot record a daily log at all — and
  the seed's 60001002-authored rows could not be reproduced in-app (see sec 0). Confirm
  intended authorship; if 老總 should write dailies, widen the gate.

- [GOOD] Manpower/plant/weather AM-PM/warning-signals + 複製琴日. The seed's three dailies
  (晴 / 陰-雨 / 酷熱) carry trade headcounts, plant counts, and a 酷熱天氣警告 signal; seedFrom +
  複製琴日 (DailyEdit.tsx:64) make repeat entry fast.

- [UX] S3 — One daily per (project,user,date) — no consolidated site view. onConflict
  project_id,user_id,date means each foreman writes their own diary; there is no merged
  "today's site log". On a multi-trade 大地盤 the PM must read several separate rows.

---

## 10. 行事曆 (Timetable / Events)

- [GOOD] Mixed event types + derived progress/material milestones. Seed has a weekly
  coordination meeting, a 勞工處塔吊年檢 inspection, and a T1 結構封頂 milestone.

- [BUG] S3 — Timetable write gate keys on GLOBAL role, unlike most modules.
  TimetablePage.tsx:92 checks profile.global_role, whereas SI/VO/PTW/materials/weather gate
  on the per-project membership role. A main_contractor global user who is NOT a member of
  this project could still see write affordances (or be denied by RLS, producing a failing
  action). Align with the membership-role pattern.

- [UX] S4 — Statutory inspection events are not linked to the equipment form. The seeded
  塔吊年檢 event and the LALG-F1 form on EQ-001 are unrelated rows; ticking one does not
  update the other.

---

## 11. 聯絡人 (Contacts)

- [GOOD] Trade address book + one-tap call. Seed has 強記紮鐵 / 永盛機電 / 城建混凝土 / 高空幕牆
  with trades and phones.

- [UX] S3 — Read-only for everyone but admin/PM curators. ContactsContext comment (:77)
  notes 判頭/老總 are read-only. On a big site the 判頭 cannot add his own sub-trade contacts;
  only the curator can. Let members propose contacts.

- [UX] S4 — No link between a contact and the trade's progress items. 強記紮鐵 (紮鐵) is not
  tied to the 紮鐵 leaves (C.3.2, D.1.1); you cannot jump from the delayed 轉換層鋼筋 item to
  call the 紮鐵 judhead.

---

## 12. 機械 / 表格 (Equipment register + statutory forms)

- [GOOD] Expired + expiring tiles drive the boss view. Seed sets EQ-002 scaffold CSSR-F5
  valid_until = -2 days (EXPIRED) and EQ-001 crane LALG-F1 valid_until = +3 days
  (expiring). The 5-tile dashboard + per-instance days-remaining chips
  (EquipmentList.tsx:199) light up red+amber on load.

- [UX] S2 — AddEquipmentModal cannot attach a form template at creation. Role:
  PM/MC/safety. The modal (EquipmentList.tsx:241) collects kind/name/brand/serial/location
  but no ref_no and no form template — you create the machine, then must open its detail to
  attach LALG-F1/CSSR-F5. The seed wired instances directly, so a persona reproducing it
  has a two-step, non-obvious flow.

- [UX] S3 — Equipment entry is role-gated with no flag, unlike the rest. Comment at
  ProjectDetail.tsx:728 notes v55 ships forms_enabled=false but exposes NO get_forms_enabled
  RPC, so the entry is role-gated (admin/PM/main_contractor/safety_officer) instead of
  flag-gated. 判頭 60001005 and the worker are excluded from even viewing the register card
  via Tools, reaching it only by a reminder deep-link.

- [GOOD] Credential gate + QR print sheet + register export. Managers verify uploaded
  credentials (VerifyCredentialsPanel) and 列印全部 QR mints a token per machine.

---

## 13. 助理 (AI 站長) + cross-cutting

- [GOOD] AI tab gated on project ai_enabled + module switch. Seed sets ai_enabled=true;
  showAssistantTab requires both (ProjectDetail.tsx:112).

- [BUG] S2 — general_foreman (老總) write rights are inconsistent across modules. Same role,
  different gates: Progress structural and Documents INCLUDE it (membership role); Materials
  INCLUDES it (membership role); Weather INCLUDES it (v65 union); Timetable/MaterialList/
  Weather-page key on GLOBAL role; SI/VO/PTW EXCLUDE it; Dailies EXCLUDE it; Issues
  canActOnIssue EXCLUDES it. A 老總 persona finds the app grants/denies edits seemingly at
  random. Define one canonical 老總 capability matrix and apply it uniformly.

- [BUG] S2 — Cross-project Dashboard is PM/admin-only; MC and 老總 are bounced. Dashboard
  shows only projects where the user is admin or in assigned_pm_ids, and redirects everyone
  else to /home (Dashboard.tsx:39,151). On a 大地盤 the main_contractor/engineer 60001003 and
  老總 60001002 — the supervisory chain — have no portfolio view at all. Widen Dashboard
  access to approved supervisors or hide the entry for them.

- [MISSING] S2 — No cross-project SI/VO/PTW approval inbox. Only documents get the 待我審批
  Home tile (Home.tsx:181). A PM who is the approval bottleneck for SI-002 / VO-002 /
  PTW-002 has no inbox — they must enter each project and each module. A unified 待我簽核 feed
  (the NotificationDigestItem type at types.ts:776 hints at the intent) is the highest-
  leverage add for the 大地盤 supervisory chain.

- [BUG] S3 — Weather route missing from desktop Sidebar. 天氣記錄 (/project/:id/weather) is
  offered in the mobile/Tools ToolsSwitcher (ProjectDetail.tsx:748) but is NOT in
  ProjectNavLinks (Sidebar.tsx:155), so on desktop the weather/EOT surface is only reachable
  via the 工具 tab, not the persistent sidebar — inconsistent with every other module link.

- [UX] S3 — Module-disabled projects undercount Dashboard 處理中問題. The Dashboard footnote
  (Dashboard.tsx:180) admits RLS hides issues from 問題-disabled projects, so the cross-
  project open-issue count can silently under-report.

- [GOOD] Step-up re-auth + signature non-repudiation on sensitive actions.
  requireStepUp('approval' / 'progress_delete') (VoApproverBar.tsx:128, ProjectDetail.tsx:386)
  and the 簽名證明 certificate on PTW signoffs give the shared-audit-trail value prop real teeth.
