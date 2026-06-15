# Simulation Findings — 大樓維修 ([DEMO] 太古城外牆及機電保養, project_type=maintenance, d0000004-…)

STATIC review of src/ + seed-maintenance.sql + supabase/*.sql. 42 items across 13 modules + cross-cutting. Tags [BUG]/[UX]/[MISSING]/[GOOD], severity S1(demo-breaking)…S4(cosmetic). NOTE: the harness blocked writing the .md file — persist this content to C:\\Users\\user\\construction-app\\.planning\\sim-2026\\findings-maintenance.md.

## TOP / HIGHEST-ROI
- [BUG S1] unit_status vocabulary mismatch: seed A.3.1 (d0000004-0a31-…-01) uses label_status values 'unprocessed'/'to_inspect' but app UnitState (src/types.ts:112) only knows pending/fixing/fixed/reinspect/signed_off. v44 column has NO CHECK so seed inserts, but UNIT_STATE_ZH[st]/UNIT_STATE_STYLE[st] (UpdateProgressModal.tsx:334) are undefined → BLANK chips for 12/F-D,18/F-B,22/F-A,25/F-C; unitStatusCounts misses them; nextUnitState('unprocessed') indexOf=-1 → first tap silently resets to 'pending', destroying the dispute trail. Fix seed: unprocessed→pending, to_inspect→reinspect; also harden UNIT_STATE_ZH[st]??st.
- [BUG S1] Statutory-form signing undemoable: form_templates CSSR-F5/SWP-WEEKLY/LALG-F1 all required_credential='competent_person' (v55), but seed creates ZERO user_credentials. EquipmentDetail.tsx gates 簽署 on hasMatchingCredential + record_form_signoff RPC hard-rejects → 簽署 DISABLED for everyone incl. safety_officer 60000004 (the assigned signer). The flagship 法定表格手機簽署 feature cannot be performed. Fix: seed a verified competent_person credential for 60000004.
- [MISSING S2] Approval/signoff tables un-seeded: SI-001(locked), VO-001(approved), PTW-001(active), 3 form_instances all render EMPTY approval timelines / no signoffs because seed inserts NO approvals/permit_signoffs/form_signoffs. The core promise (audit trail that survives disputes) shows blank on every flagship signed doc. Highest-ROI seed fix.
- [BUG S2] Progress export omits unit_status: src/lib/export.ts trackingLabel() (line 180) has floors/checklist/quantity then default:'' — no unit_status case, so the defect register (A.3.1/A.3.2, the whole MWIS point) exports a BLANK 進度 column. Fix: add case 'unit_status' using unitStatusCounts.
- [BUG S2] Active PTW never auto-expires: PTW-001 status='active', expires_at=end-of-today HKT. No cron exists (per CLAUDE.md) AND client doesn't compensate — PtwList.tsx:31 filters on stored p.status; PtwDetail.tsx:111 shows 生效中 + valid QR whenever status==='active' regardless of expires_at past. Tomorrow it still reads 生效中 with a verifying QR — occupied-building height-permit safety hole. Fix: derive active&&expires_at<now→expired client-side; add the cron.

## MODULE 1 進度
- [BUG S3] Maintenance KPI tiles (簽收/修復/共) promised by progressTemplates MAINTENANCE comment are NEVER rendered — ProjectDetail.tsx only special-cases DeadlineTile; the 4 stat tiles (line 344) are the generic 已完成/進行中/落後/未開始 for ALL types. No 簽收/修復 rollup across 座.
- [BUG S3] 法定限期 tile (ProjectDetail.tsx:218) = earliest L1 planned_end = C公共地方(+30d), unrelated to any MBIS/MWIS legal order; masquerades as a deadline. Fix: real statutory_deadline field or relabel 最早完工目標.
- [BUG S2] Stored status column ignored everywhere: deriveStatus/computeRollup never return 'blocked', so seed's status='blocked' on parent B.3消防 is discarded; parent rolls up to 落後 not 受阻 even though leaf B.3.1 has blocked_reason. Rollups can't surface a child's 受阻.
- [UX S3] A.3.2 C座防水 seeded 'delayed' w/ note '棚架未到位' but blocked_reason NULL → shows 落後 not 受阻, losing the 受阻-chip beat on a defect item. Fix seed: blocked_reason='物料'.
- [UX S4] No unit_status progress_history rows seeded → 歷史 modal for A.3.1 empty; the 12/F-A：待覆檢→已簽收 diff feature never shows. Fix seed: add history rows w/ label_status.
- [GOOD] unit_status authoring (CreateItemModal 樓×室 generator line 227) + 5-state per-room chip editor + 已簽收/共 headline + rose DoorOpen badge = strong MWIS demo.
- [GOOD] quantity mode B.1.1 升降機(3/6部) + ±10 stepper finger-friendly for 機電保養.

## MODULE 2 問題
- [BUG S2] general_foreman 老總 & safety_officer have NO issue-chain authority: getInitialHandler (types.ts:513) has no case for them (→default 'pm'); canActOnIssue (IssuesContext.tsx:260) grants only admin/pm/main_contractor/subcontractor+reporter. 老總 60001002 can't resolve/escalate any issue he didn't report (incl. worker's #1 棚網鬆脫). Fix: add 老總 to chain / grant act-rights.
- [BUG S3] safety_officer can't action safety issue #1 (棚架護網鬆脫 安全隱患) — only comment. Fix: grant安全主任 resolve rights on open issues.
- [UX S3] Chain dead-ends if no member holds handler role; relies on reporter fallback. Fix: skip empty tiers, show 此層級暫無負責人.
- [UX S4] Issues have free-text location only, no FK to progress leaf/equipment; #2 滲水→SI-001→A.3.2 link invisible in UI.
- [GOOD] issue_no(#001) + 處理層 pill + escalated/commented/resolved activity log render the 4-issue mix cleanly.

## MODULE 3 SI
- [GOOD] SI-001 locked + SI-002 in_review, chain_snapshot, 已鎖定/審批中 badges all correct.
- [UX S3] SI-001/002 created_by MC engineer; no 判頭-authored SI in seed to show that path (issue #2 flowed from 判頭).
- [MISSING S3] No UI thread SI-001→issue#2→A.3.2→VO-001 (richest 維修 story exists in data, unlinked).

## MODULE 4 VO
- [BUG S3] VO-001 created_by 判頭 60001005, status='approved', but NO approvals rows seeded → 已批准 with empty 簽核紀錄; can't show who approved (same for SI-001/PTW-001).
- [GOOD] VO line items reference real leaf A.3.2 (C座防水注漿) + cents→HKD + LINE_ITEM_CATEGORY_ZH; total HKD 285,000.

## MODULE 5 PTW
- [BUG S3] PtwDetail 簽核紀錄 hidden (approvals.length===0) — seed has permit+version+3 workers but no approvals/permit_signoffs; safety_officer-in-chain signature never shown.
- [GOOD] work_at_height checklist HK-accurate (全身式安全帶/獨立救生繩, 綠色合格牌棚紙, 無風球/暴雨, 工具繫繩) + worker list + active QR.
- [UX S4] Fire-watch UI hot_work-only (correct); height permit gets bare 關閉許可證 (less flashy demo path).

## MODULE 6 天氣/EOT
- [GOOD] weather_events(black-rain 78mm@太古, amber-rain) + project_weather_claims(critical-path 1d / non-critical 0.25d) model 棚上停工→申索 well.
- [UX S3] Both claims recorded_by PM only; verify WeatherRecord write-gate — 老總/MC who witness the stoppage may be blocked from filing the EOT claim.
- [UX S4] amber-rain evidence.cancelled is synthetic now()-derived timestamp.

## MODULE 7 文件
- [BUG S2] Documents double-gated (files_enabled flag + module). Seed inserts MS-001(approved)/DWG-001(submitted) but if files_enabled OFF, only ADMIN sees 文件 card — PM/MC can't reach seeded approved method statement. Fix: ensure flag ON for demo.
- [GOOD] MS-001 approved-by-PM w/ note, DWG-001 submitted, document_events trail complete.
- [UX S3] DWG-001 review_due_date NULL → won't show 逾期 in PM PendingReviews cross-project queue.

## MODULE 8 物料
- [GOOD] 4 states demo cleanly: 防水塗料 arrived / 注漿料 partial 80/200 / 面油 requested-future / 補棚竹枝 overdue(planned 2d ago, 0); isMaterialLate derives 逾期; status generated column. B座棚架等料→overdue tight.
- [UX S3] item_ids link materials→leaves (注漿料→A.3.2) but MaterialItemsPanel only in expanded leaf; no reverse view showing overdue 補棚 blocks delayed A.2.2 B座棚架.

## MODULE 9 每日日誌
- [BUG S2] DailiesContext.upsertMyDaily (line 164) gates on global_role==='main_contractor' && sub_role∈(foreman|engineer). 老總 60001002 (natural 維修 daily author) gets '只有總承建商管工或工程師可以填寫日誌'; PM & 判頭 blocked. Seed author 60001003 must have sub_role set in auth or even they can't edit seeded logs (seed doesn't set sub_role). Fix: allow general_foreman.
- [GOOD] v45 manpower(棚工6/泥水8/雜工4)+plant(吊船2/發電機1)+weather_am/pm+黃雨 warning_signal; ties to weather claim.

## MODULE 10 行事曆
- [GOOD] 3 events: 法團會議/棚架安全檢查/50%里程碑, typed, future-dated.
- [UX S4] milestone ends_at NULL — verify zero-duration render.
- [UX S3] 棚架安全檢查 created_by 老總 60001002 — verify events INSERT allows general_foreman (if admin/pm/MC-only, the 老總 organising the勞工處 inspection can't create his own event).

## MODULE 11 聯絡人
- [GOOD] maintenance-apt trades: 註冊棚廠/永泰防水/安泰機電(EMSD)/業主立案法團(管理處) — 法團 contact is right HK touch for 停水審批; one-tap-call.
- [UX S4] all created_by PM; verify 老總/MC can add a trade on the fly.

## MODULE 12 機械/法定表格 (heaviest for 維修)
- [GOOD] forms dashboard 5 tiles + per-equipment chips render CSSR-F5棚紙(+2d 即將到期)/SWP-WEEKLY吊船(-1d 過期)/LALG-F1吊機(NULL 未簽) — best safety-compliance beat (read-only; signing blocked, see S1 credential gap).
- [GOOD] equipment QR mint + EquipmentVerify (scan→equipment_scans+表格狀態+去簽署 deep link) complete for EQ-001棚架/EQ-002吊船/EQ-003吊機.
- [BUG S3] EquipmentVerify shows 去簽署 to any member, but target EquipmentDetail disables 簽署 without competent_person credential → worker scanning expired 吊船 hits a dead button. Fix: only show 去簽署 to credentialed users / annotate.
- [UX S3] fail sign-off auto-suspends equipment + notifies (v55:304) — great story, undemoable w/o credential.
- [UX S4] equipment KIND_OPTIONS = scaffold/excavation/lifting_appliance/swp/other — NO 電梯/水泵/發電機/消防, so the entire 機電保養 大項 plant can't be registered with its own 法定表格 (all fall to 'other').
- [MISSING S3] No 機電/消防 statutory templates (only construction-plant CSSR/LALG/SWP). 消防FS表格/電梯EMSD月檢/水缸水質 have no templates → B.1.1/B.2.1/B.2.2 can't drive a due-form dashboard. Forms module covers 搭棚 side of 維修 but not 機電/消防 side.

## MODULE 13 助理
- [GOOD] ai_enabled=true → 助理 tab shows; get_weather_outlook + recall_memory live.
- [UX S3] No maintenance-specific AI tool — can't ask '邊啲法定表格快到期?' or 'C座防水做到邊?'; highest-value 維修 queries (form expiry, defect sign-off rate) unwired.

## CROSS-CUTTING
- [BUG S2] Non-PM members get NO Dashboard: Dashboard.tsx:151 redirects unless admin/assigned-PM; 老總/MC/判頭/安全主任 never get cross-site rollup. Fix: scoped dashboard for MC/老總.
- [BUG S3] label_status has no DB CHECK (v44) → any string storable; app mis-renders (blank) + nextUnitState resets unknown→pending on first tap. Latent footgun for imports/AI/other clients. Fix: CHECK constraint or normalising read-path.
- [UX S3] documents(files_enabled) + ptw(ptw_enabled) double-gated; if global flags OFF in demo tenant, seeded SI/VO/PTW/文件 reachable only by admin. Verify flags ON.
- [GOOD] project_type='maintenance' cleanly drives 座/室 vocab + unit_status default + DeadlineTile off one field; general projects byte-identical.
- [UX S4] maintenance template labels every zone 座, but z-mep(機電系統)/z-podium(公共) aren't 座 — zone headers read slightly off.