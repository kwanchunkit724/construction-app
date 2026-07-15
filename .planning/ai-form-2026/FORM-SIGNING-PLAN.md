# FORM-SIGNING-PLAN — 地盤表格管理 + 手機簽署 (Site Statutory Forms & Mobile E-Signing)

> Research + design plan. Status: PROPOSAL — nothing in this file has been migrated or coded.
> Grounded in the live schema (`supabase/v10-ptw-schema.sql`, `v51-audit-ledger-tamper-evidence.sql`,
> `v52/v53/v54 step-up`, `v9-chain-schema.sql`, `v9-split/1-push-dispatcher.sql`) and the live client
> (`src/contexts/PtwContext.tsx`, `src/contexts/StepUpContext.tsx`, `src/components/ptw/PtwSignaturePad.tsx`,
> `src/lib/ptw-jwt.ts`). Next free migration version: **v55** (highest existing: v54).

---

## 0. Executive Summary

1. HK sites carry a dozen+ statutory periodic inspection forms (棚架 Form 5, 升降台/吊機 LALG Form 1/5, 吊船 6個月徹底檢驗, 挖掘 Form 4, 吊重機 Form 1/3, 電力 WR2 …), each with a prescribed signer qualification, frequency and validity — catalogued in §1 with sources.
2. Design: an **equipment/plant register** per project + **form instances** (equipment × form template) + **sign-off events**, all additive (`v55-equipment-forms-schema.sql`), no change to live tables.
3. Signing reuses the proven PTW pattern verbatim: `PtwSignaturePad` → SECURITY DEFINER RPC (`record_form_signoff`, mirroring `record_ptw_signoff` in `supabase/v10-split/4-record-ptw-signoff-rpc.sql`) → signature stored server-side, direct INSERT denied by RLS `with check (false)`.
4. Signatures are identity-bound and tamper-evident: `assert_step_up()` (v52/v54 AAL2 TOTP, new action class `form_signoff`) + `audit_ledger` hash-chain trigger attached to all new tables (v51 pattern, `verify_integrity()`).
5. Qualified persons are modelled as **verifiable credentials** (`user_credentials` table, mirroring the v48 `green_card_no/expiry` precedent on `user_profiles`) — the RPC refuses a sign-off whose signer lacks a verified, in-date credential matching the template.
6. Convenience: 5 methods compared (§3). Recommendation: register + scheduled reminders as the **backbone**, **QR-per-equipment as the primary on-site UX** (reuses `mint_ptw_jwt`/`verify_ptw_jwt`/`permit_scans` infra ~80%), assignment-push for visiting competent examiners; NFC rejected for now; photo+e-sign kept as paper-compliance bridge.
7. Reminders: daily pg_cron sweep (mirrors the existing `'ptw-expiry'` job in v10) → **one batched push per user per day** through `push_dispatcher` (already enforces 3/day cap + digest overflow — OneSignal free tier safe).
8. Dashboard for 安全主任/老總/PM: per-project counts — 有效 / 即將到期 / 過期 / 未簽 — list drill-down per equipment; derived server-side in one RPC.
9. Honest legal caveat: the Labour Department's *approved form* must still be displayed/kept on site (e.g., Form 5 on the scaffold) — the app generates a printable approved-form PDF replica via the existing `jspdf` stack (`src/lib/export.ts`); the e-record is the management + evidence layer.
10. Build phases tagged [Fable=plan/review] / [Opus=execute] / [Haiku=debug] in §8; Phase 0 is a user decision gate (§7). Bonus finding: v51's audit watch-list names `ptw_versions` but the real table is `permit_versions` — it is silently unaudited today; v55 fixes it.

---

## 1. FORMS CATALOG — HK statutory periodic sign-off forms (研究結果)

Legend: **CP** = competent person 合資格的人 (trained/experienced, appointed by contractor); **CE** = competent examiner 合資格檢驗員 (Registered Professional Engineer or person approved by Commissioner for Labour — far scarcer, usually an external visiting engineer).

### 1.1 Construction Sites (Safety) Regulations (Cap 59I) — 《建築地盤(安全)規例》

| Form | 俗稱 / slang | Equipment / scope | Signer | Frequency | Validity / display | Statutory basis |
|---|---|---|---|---|---|---|
| **Form 5** | 「Form 5」/「棚紙」— the trade name *is* the form number | 棚架 — bamboo 竹棚, metal 金屬棚, **truss-out 狗臂架/懸空棚** | **CP** (trained scaffolder/safety supervisor appointed by contractor) | Before first use; **every 14 days** (fortnightly); after bad weather (颱風/暴雨), substantial alteration | Valid 14 days from inspection; **must be displayed prominently on the scaffold** | Part VA, Cap 59I (reg 38A·38B); LD guide "Part VA of the CSSR" |
| **Form 4** | 「掘地紙」 | 挖掘及土方工程 excavation & earthworks (incl. shoring 支撐) | **CP** | **Every 7 days**; also after rain/blasting/unexpected fall of material | 7 days | reg 39(2), Cap 59I (form header cites reg 39(2)) |
| **Form 1** | 吊重機週檢 | 材料吊重機 (material hoist) | **CP** | **Weekly** | 7 days | Cap 59I hoist provisions |
| **Form 2** | — | Material hoist — certificate of test & thorough examination | **CE** | After erection / re-erection / height alteration, before use | Until next trigger event | Cap 59I |
| **Form 3** | — | Material hoist — thorough examination | **CE** | **Every 6 months** | 6 months | Cap 59I |

Sources: [Cap 59I e-Legislation](https://www.elegislation.gov.hk/hk/cap59I) · [LD guide — Part VA scaffolds](https://www.labour.gov.hk/eng/public/os/A/PartVA.pdf) · [LD guide — excavations](https://www.labour.gov.hk/eng/public/os/A/Excv.pdf) · [CSSR Form 4 (reg 39(2))](https://www.labour.gov.hk/text_alternative/pdf/eng/cssrf4.pdf) · [LCQ7 scaffolding 2025](https://www.info.gov.hk/gia/general/202507/30/P2025073000261.htm) · [Code of Practice for Bamboo Scaffolding Safety](https://www.hkifm.org.hk/public_html/2020_doc/LD_Code%20of%20Practice_BS%20Safety.pdf)

### 1.2 FIU (Lifting Appliances and Lifting Gear) Regulations (Cap 59J) —《起重機械及起重裝置規例》— "LALG forms"

| Form | Purpose | Signer | Frequency | Validity |
|---|---|---|---|---|
| **LALG Form 1** | Weekly inspection report of lifting appliance 起重機械每週檢查 | **CP** | **Every 7 days** while in use | 7 days |
| **LALG Form 2** | Test & thorough exam of **anchoring/ballasting of crane** 錨碇/壓重 | **CE** | After installation/re-erection; after weather exposure liable to affect stability | event-driven |
| **LALG Form 3** | Test & thorough exam of **crane / crab / winch** (reg 5(3)&(5)) | **CE** | Before first use; after substantial repair/alteration; periodic re-test ⚠ (commonly quoted 4-yearly for cranes — verify exact reg text before seeding) | event / ⚠ |
| **LALG Form 4** | Test & thorough exam of **other lifting appliances** (非起重機/吊重磨轆/絞車) — this is the bucket that covers **MEWP 升降台** in trade practice | **CE** | Before first use; after substantial repair | event-driven |
| **LALG Form 5** | **12-monthly thorough examination** certificate of lifting appliance 過往十二個月內徹底檢驗 | **CE** | **Every 12 months** | 12 months |
| **LALG Form 6** | Test & thorough exam of chains/cables/**lifting gear** 起重裝置 (吊鏈/吊纜/吊具) | **CE** | Before first use | event-driven |
| **LALG Form 7** | **6-monthly thorough examination** of chains/cables/lifting gear | **CE** | **Every 6 months** | 6 months |

**升降台 / MEWP (流動式升降工作台):** treated in HK practice as a lifting appliance under Cap 59J → needs **Form 1 weekly (CP)** + **Form 5 annual (CE)** (+ Form 4 test cert), and trade practice is to display Form 1/4/5 + operator authorization on the machine. Operators need recognized training (no government licence regime; LD guidance notes apply). This is exactly the user's "升降台要合資格人士檢驗先可以用" case.

Sources: [LD guide to FIU(LALG) Regs](https://www.labour.gov.hk/eng/public/os/A/FIU_LALG_ENG.pdf) · [LALG-F1 form](https://www.labour.gov.hk/eng/form/os/pdf/LALG-F1.pdf) · [LALG-F5 form](https://www.labour.gov.hk/eng/form/os/pdf/LALG-F5.pdf) · [LALG-F7 form](https://www.labour.gov.hk/eng/form/os/pdf/LALG-F7.pdf) · [LD guidance — inspection/examination/testing of LA & LG](https://www.labour.gov.hk/eng/public/os/C/gear.pdf) · [LD MEWP guidance notes](https://www.labour.gov.hk/eng/public/os/C/EWP.pdf) · [升降台 Form 1 trade guide (RentEasy)](https://blog.renteasyhk.com/%E5%8D%87%E9%99%8D%E5%8F%B0form-1/)

### 1.3 FIU (Suspended Working Platforms) Regulation (Cap 59AC) — 吊船

| Check | Signer | Frequency | Notes |
|---|---|---|---|
| Daily check of suspension/safety wire ropes etc. | trained operator / CP | **Daily before use** | CoP for Safe Use & Operation of SWP |
| Weekly inspection | **CP** | **Every 7 days** | |
| **Thorough examination + load test** | **CE — must be an RPE** (Cap 59AC defines competent examiner as Registered Professional Engineer of a relevant discipline) | Before first use, after re-erection/substantial repair/typhoon exposure, and **at intervals not exceeding 6 months** | ⚠ LD publishes report forms for SWP (load-test report / thorough-examination report / weekly report); exact form numbering not verified — confirm against the LD "Guidance Notes on Inspection, Thorough Examination and Testing of SWP" before seeding |

Sources: [Cap 59AC](https://www.elegislation.gov.hk/hk/cap59AC) · [CoP — Safe Use and Operation of SWP](https://www.labour.gov.hk/eng/public/os/B/platform.pdf) · [LD guidance notes — SWP examination](https://www.labour.gov.hk/eng/public/os/C/SWP.pdf) · [LD guide to Cap 59AC](https://www.labour.gov.hk/eng/public/os/A/SWPreg.pdf)

### 1.4 Others commonly on a CK-type site

| Item | Form / cert | Signer | Frequency | Statutory basis | Confidence |
|---|---|---|---|---|---|
| 建築工地升降機 / 塔式工作平台 (builders' lift, tower working platform) | Use permit + periodic examination/test reports filed with EMSD | Registered examiner (Cap 470 regime) | Periodic examination ~**6-monthly**, load test on erection/alteration ⚠ exact intervals per Cap 470 subsidiary regs | [Cap 470](https://www.elegislation.gov.hk/hk/cap470) · [EMSD RC list](https://www.emsd.gov.hk/filemanager/en/content_608/20260401%20RC-BLTWP-ENG.pdf) | Medium — verify intervals |
| 地盤臨時電力裝置 (site temporary electrical installation) | **WR1 / WR2** periodic test certificate | Registered Electrical Worker / Contractor (REW/REC) | Construction-site installations commonly **every 12 months**; fixed installations >100A every **5 years** | Electricity (Wiring) Regulations Cap 406E; [EMSD periodic test](https://www.emsd.gov.hk/en/electricity_safety/periodic_test_for_fixed_electrical_installations/index.html) | Medium-high |
| 密閉空間 (confined space) | Risk assessment + entry certificate | **CP (confined space)** | Per entry / per period stated in certificate | Cap 59AE — already partially covered by the PTW domain (`ptw_type='confined_space'` in `permits_to_work`) | High |
| 空氣接收器 air receiver (compressors) | Certificate of fitness | Appointed examiner | Periodic (⚠ commonly cited ~26 months — verify Cap 56 text) | Boilers & Pressure Vessels Ordinance Cap 56 | Low — verify |
| 圍板/棚架以外臨時工程 hoarding & temporary works | Inspection records per contract/Buildings Dept practice notes (no single LD approved form) | TWC/engineer per contract | per contract | BD PNAP/contract spec | Medium |
| 平安咭 / 工人證書 (worker green card) | — | — | expiry tracked per person | **Already in app**: `user_profiles.green_card_no / green_card_expiry` (v48) | — |

**Catalog takeaways for the data model:**
- Two signer tiers — **CP** (in-house, frequent, weekly/fortnightly forms) vs **CE/RPE** (external, scarce, 6/12-month certificates). The UX must serve both: CP = on-site phone signing; CE = scheduled-visit assignment.
- Frequencies cluster on 1/7/14/180/365 days + event-driven triggers (颱風後, re-erection) → model as `frequency_days` + a manual "trigger re-inspection" action.
- Several forms must be **displayed on the equipment itself** (Form 5 on scaffold, MEWP forms on platform) → paper replica generation is mandatory, not optional (§3.e).

---

## 2. DATA MODEL — `supabase/v55-equipment-forms-schema.sql` (additive only)

All tables new; no destructive change. RLS via the existing helpers `can_view_project(uid, project_id)` and `can_edit_project_progress(uid, project_id)` (`supabase/v9-rls-helpers.sql`), the same pair PTW uses (v10 §5).

### 2.1 Tables

```sql
-- 1) Form template registry (seeded, admin-editable)
create table form_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,            -- 'CSSR-F5' | 'CSSR-F4' | 'LALG-F1' | 'LALG-F5' | 'SWP-6M' | 'SWP-WEEKLY' | 'WR2' ...
  name_zh text not null,                -- '棚架檢查報告 (Form 5)'
  slang_zh text,                        -- '棚紙'
  statutory_ref text,                   -- 'Cap 59I Part VA reg 38A'
  equipment_kind text not null,         -- 'scaffold'|'hoist'|'excavation'|'lifting_appliance'|'lifting_gear'|'mewp'|'swp'|'builders_lift'|'electrical'|'other'
  frequency_days int,                   -- 7 / 14 / 180 / 365; null = event-driven only
  remind_before_days int not null default 3,
  required_credential text not null,    -- 'competent_person' | 'competent_examiner' | 'rpe' | 'rew'
  checklist jsonb not null default '[]',-- [{key,label_zh,required}] — same shape as PtwChecklistItem (src/types.ts:882)
  active boolean not null default true
);

-- 2) Equipment / plant register (the 機械/form-required item list the boss wants to SEE)
create table equipment_register (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  kind text not null,                   -- matches form_templates.equipment_kind
  ref_no text not null,                 -- 'EQ-001' via next_equipment_ref() (mirror next_ptw_number, v10 §7)
  name_zh text not null,                -- '3樓外牆竹棚 (A座)' / '剪式升降台 #2'
  brand_model text, serial_no text,
  location_zh text,
  photo_path text,                      -- storage; compress-on-upload per CLAUDE.md budget
  status text not null default 'active' check (status in ('active','idle','offsite','retired')),
  created_by uuid not null references user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (project_id, ref_no)
);

-- 3) Form instance = the recurring requirement: ONE row per (equipment × template).
--    location-only instances (e.g. excavation Form 4 has no "machine") use equipment_id null + location_zh.
create table form_instances (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  equipment_id uuid references equipment_register(id) on delete cascade,
  template_id uuid not null references form_templates(id) on delete restrict,
  location_zh text,
  assigned_signer_id uuid references user_profiles(id),  -- optional: the QP who usually signs (method d)
  last_signoff_id uuid,                 -- deferred FK (PTW current_version_id pattern, v10 §3)
  valid_until timestamptz,              -- denormalized from last signoff for cheap dashboard/cron queries
  suspended boolean not null default false,  -- failed inspection → 停用
  created_by uuid not null references user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (equipment_id, template_id)
);

-- 4) Sign-off events (append-only; the e-signature record)
create table form_signoffs (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references form_instances(id) on delete cascade,
  project_id uuid not null,             -- denormalized for RLS speed
  result text not null check (result in ('pass','pass_with_remarks','fail')),
  payload jsonb not null,               -- filled checklist + remarks + photo paths
  signed_by uuid not null references user_profiles(id) on delete restrict,
  signed_at timestamptz not null default now(),
  valid_until timestamptz,              -- signed_at + template.frequency_days
  signature_b64 text not null,          -- same storage as permit_signoffs.signature_b64 (v10 §3)
  credential_id uuid,                   -- which credential authorized this signer
  credential_snapshot jsonb,            -- frozen copy {type, cert_no, valid_until} — survives later credential edits
  pdf_path text                         -- generated approved-form replica in storage
);

-- 5) Qualified-person credentials (generalizes the v48 green_card precedent)
create table user_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references user_profiles(id) on delete cascade,
  credential_type text not null,        -- 'competent_person' | 'competent_examiner' | 'rpe' | 'rew' | ...
  cert_name_zh text not null,           -- '竹棚架合資格人士證書'
  cert_no text,
  issuer text,                          -- 'CIC' / '勞工處' / 'HKIE'
  valid_from date, valid_until date,
  doc_path text,                        -- uploaded cert photo (private bucket, v8-private-bucket-template.sql pattern)
  verified_by uuid references user_profiles(id),  -- admin/PM/safety_officer vouches after seeing the cert
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

-- 6) Scan audit (mirror of permit_scans, v10 §3)
create table equipment_scans (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references equipment_register(id) on delete cascade,
  scanned_by uuid not null references user_profiles(id) on delete restrict,
  scanned_at timestamptz not null default now(),
  jwt_payload_snapshot jsonb not null
);
```

### 2.2 RLS posture (copies PTW v10 §5 exactly)

- SELECT on all six tables: `can_view_project(auth.uid(), project_id)` (join through equipment/instance for child tables — same `exists(select 1 from …)` shape as the `permit_versions` policies).
- `equipment_register` / `form_instances` INSERT/UPDATE: `can_edit_project_progress()` AND role ∈ (pm, main_contractor, safety_officer) — see §6.
- `form_signoffs` INSERT: **`with check (false)`** — RPC-only, byte-for-byte the `permit_signoffs` posture ("Insert signoffs direct … with check (false)", v10 line 239-241).
- `equipment_scans` INSERT: `with check (false)` — written only by `verify_equipment_jwt` (mirror of `permit_scans`, v10 line 251-253).
- `user_credentials`: owner inserts/updates own rows; `verified_by/verified_at` settable only via an RPC gated to admin/PM/safety_officer; everyone in a shared project may SELECT (signer eligibility must be visible to approvers).
- No DELETE policies anywhere (PTW precedent: "NO delete policy", v10 line 190).

### 2.3 RPCs (SECURITY DEFINER, `set search_path = public`)

| RPC | Mirrors | Behaviour |
|---|---|---|
| `next_equipment_ref(p_project_id)` | `next_ptw_number` (v10 §7) | per-project sequence → 'EQ-001' |
| `record_form_signoff(p_instance_id, p_result, p_payload, p_signature_b64)` | `record_ptw_signoff` (v10-split/4) + `close_out_ptw` signature checks (v10 §13: rejects `length < 100`) | 1) auth + membership check; 2) **`perform assert_step_up('form_signoff')`** (v52/v54 — no-op until `step_up_enforced` flips); 3) credential check: signer must hold a `user_credentials` row with `credential_type = template.required_credential`, `verified_at is not null`, `valid_until >= today` — else raise `'你未有有效的合資格人士證明'`; 4) insert signoff with `credential_snapshot`; 5) update `form_instances.last_signoff_id / valid_until` (= now + frequency_days), clear `suspended` on pass; 6) on `result='fail'` set `suspended=true` and push to safety_officer + PM via `push_dispatcher` |
| `mint_equipment_jwt(p_equipment_id)` | `mint_ptw_jwt` (v10 §9) | signs `{equipment_id, project_id, ref_no, kind}` with new `app_config.equipment_qr_secret`; **key difference from PTW: long-lived token (suggest 12 months)** because the QR is printed and affixed — the token authenticates the *tag*, never the *validity*; validity is always read live in the verify step |
| `verify_equipment_jwt(p_token)` | `verify_ptw_jwt` (v10 §10) | login-gated (`auth.uid() is null → raise '未登入'`), membership-gated, writes `equipment_scans`, returns equipment + its instances + per-instance status |
| `get_forms_dashboard(p_project_id)` | new | one round-trip: counts {valid, expiring(≤ remind_before_days), expired, missing(no signoff yet), suspended} + per-equipment rows |
| `verify_user_credential(p_credential_id)` | membership-approval pattern | admin / assigned PM / safety_officer sets verified_by/at; **`assert_step_up('membership')`** (identity vouching is high-risk) |

### 2.4 Tamper-evidence + step-up wiring

- **audit_ledger**: extend the v51 watched-tables array with `'equipment_register','form_instances','form_signoffs','user_credentials'` and re-run the attach loop (it is idempotent: `drop trigger if exists` + `create trigger`, v51 lines 101-115). Every sign-off therefore lands in the hash chain checkable by `verify_integrity()` / exportable by `export_ledger_proof()`.
- **🐛 Fix shipped in the same migration:** v51 line 107 lists `'ptw_versions'` but the real table is **`permit_versions`** (v10 line 105). `to_regclass` guard made this silently skip → permit version edits are UNAUDITED today. v55 adds `'permit_versions'` to the loop.
- **step-up**: new action class `'form_signoff'` — server-side it's free text (v52 stores `action_class text`), client-side add to `StepUpActionClass` + `ACTION_CLASS_ZH` in `src/contexts/StepUpContext.tsx` (lines 25-40): `form_signoff: '法定表格簽署'`. Inherits the v54 rollout flag automatically (assert is a no-op until `app_config.step_up_enforced = true`).
- **rollout flag**: `app_config.forms_enabled boolean default false` — same pattern as `ptw_enabled` (v10 §2b) so the UI can ship dark.

### 2.5 Client (`src/`)

- `src/types.ts`: append `FormTemplate`, `Equipment`, `FormInstance`, `FormSignoff`, `UserCredential`, `EQUIPMENT_KIND_ZH`, `FORM_STATUS_ZH` (mirror `PTW_*` blocks at lines 863-957).
- `src/contexts/EquipmentContext.tsx` — scoped to `projectId`, realtime channel `equipment-${projectId}` (ProgressContext pattern); owns register + instances + signoffs fetch/mutate.
- Pages: `src/pages/EquipmentList.tsx` (register + dashboard), `src/pages/EquipmentDetail.tsx` (instances + sign + QR card), route `/project/:id/equipment/:equipmentId` in `src/App.tsx`; tab in `ProjectDetail.tsx`.
- Reuse as-is: `PtwSignaturePad` (`src/components/ptw/PtwSignaturePad.tsx`), `QrCard` (`src/components/ptw/PtwQrCard.tsx` — lazy `qrcode.react`), the PTW scan page camera flow, `requireStepUp()` (StepUpContext), `jspdf` PDF generation (`src/lib/export.ts`).

---

## 3. CONVENIENCE METHODS — comparison (incl. the user's QR idea)

| Method | On-site UX | Build effort | Cost / logistics | Robustness | Verdict |
|---|---|---|---|---|---|
| **(a) QR per equipment** — laminated QR on each machine/scaffold bay; scan → that item's forms → sign | ★★★★★ zero searching; also lets ANY member (or boss during inspection walk) scan to see live status — great Labour-Dept-visit story | **Low-medium** — ~80% reuse of `mint_ptw_jwt`/`verify_ptw_jwt`/`permit_scans`/`PtwQrCard`/scan page | Printing + lamination ~HK$2-5/tag; someone must own print-affix-replace (propose: 安全主任); re-print on loss | Weather/abrasion degrade paper → laminate or zip-tie tag holders; QR loss must not block signing (fallback = pick from register); login-gated scan (same C2 mitigation as v10 line 363) | **Primary on-site layer** (Phase 3) |
| **(b) Register + pick-from-list + scheduled reminders** | ★★★☆☆ 2-3 taps to find the item; reminders drive the visit | **Lowest** — pure DB + UI, no hardware | Zero | Nothing physical to lose; works for location-bound forms (excavation) where a tag is impractical | **The backbone — build first; everything else layers on it** |
| **(c) NFC tags** | ★★★★☆ tap-to-open | **High** — needs `@capawesome-team/capacitor-nfc` or similar native plugin, iOS NFC entitlement, new App Store review surface (CLAUDE.md: preserve compliance) | Tags HK$5-15 each; still needs affixing logistics; no visual affordance (can't tell a dead tag from a working one by looking) | Better weather resistance than paper QR; but marginal UX gain over QR at 3-5× cost + native risk | **Rejected for this milestone**; revisit if QR tags prove too fragile |
| **(d) Assign-to-QP e-form + push** — instance has `assigned_signer_id`; reminder push deep-links straight to the signing screen | ★★★★☆ for the *visiting* CE/RPE who must do 10 machines in one trip: one push → checklist of dues | **Low** — `assigned_signer_id` + existing `push_dispatcher` deep_link payload (v9-split/1 line 59) | Zero | Depends on the QP having the app + membership — external RPEs need onboarding (open decision §7.3) | **Co-primary for CE/6-12-month certificates** |
| **(e) Photo of physical form + e-sign overlay** | ★★☆☆☆ still paper-first | **Low** — photo upload (existing storage pattern) + signature overlay | Paper as today | Honest role: several forms must legally remain displayed ON the equipment (Form 5 on scaffold) — so paper never fully disappears; the app's job is generating + tracking it | **Keep as compliance bridge**: app generates the approved-form PDF replica (jspdf), QP prints/posts it, optional photo-back-upload as evidence |

**Recommendation:**
- **Backbone = (b)**: equipment register + form instances + reminders. Required for the dashboard regardless of input method.
- **Primary on-site convenience = (a) QR**, because the infra already exists and is battle-tested in PTW (mint/verify/scan-audit). Honest assessment of the user's QR instinct: **good idea, with eyes open** — it is a *convenience + audit* layer, not a *validity* layer (validity lives in the DB; the long-lived printed token must never imply "valid"). The verify screen must show status LARGE (有效/過期) so a scan of an expired-form machine reads unambiguously red.
- **(d) assignment+push** for competent-examiner forms (6/12-month) where the signer is a scheduled visitor, not a resident.
- **(e)** as the statutory-paper bridge; **(c) NFC** rejected for now.

---

## 4. REMINDERS (推播提醒) + DASHBOARD

### 4.1 Cron sweep — `form-reminder-sweep`

Mirror of the existing `'ptw-expiry'` job (v10 §14: `cron.schedule('ptw-expiry','0 16 * * *', …)` = 00:00 HKT):

```sql
select cron.schedule('form-reminder-sweep', '30 23 * * *',   -- 07:30 HKT, before site briefing
  $cron$ select drain_form_reminders(); $cron$);
```

`drain_form_reminders()` (SECURITY DEFINER, server-only like `drain_ptw_expiry`):
1. For each project with `forms_enabled`, classify instances: **expiring** (`valid_until - now() <= remind_before_days`), **overdue** (`valid_until < now()`), **missing** (no signoff).
2. **Batch per recipient** — never one push per form. Recipients: `assigned_signer_id` if set, else `active_role_holders(project_id, 'safety_officer')` (the v9 helper PTW uses, v10 line 430); overdue items additionally escalate to PM.
3. One payload per user per day: `heading_zh: '表格提醒'`, `content_zh: '3 項即將到期，1 項已過期 — 升降台#2 Form 5 餘 2 日'`, `deep_link: '/project/<id>/equipment'`.
4. Send via **`push_dispatcher(user, payload)`** (v9-split/1) — it already enforces the 3/day/user cap and overflows into `notification_digest` drained at 08:00 HKT. **No new OneSignal budget risk.**
5. Suppression: a `form_reminders_sent (instance_id, hkt_date, stage)` table so the same stage (T-3 / T-0 / overdue-weekly) never double-fires; overdue re-pings weekly, not daily.

### 4.2 Dashboard (安全主任 / 老總 / PM view)

`get_forms_dashboard(project_id)` → one screen:
- **Header counts**: 🟢 有效 n · 🟡 即將到期 n · 🔴 過期 n · ⚪ 未簽 n · ⛔ 停用 n — answers the boss's "幾多部機械喺場、邊啲未簽" in one glance.
- **List**: equipment ref/name/location, per-template chips with days-remaining, last signer + tap → history (every `form_signoffs` row with signature + PDF link).
- Status colors follow the CLAUDE.md badge conventions (amber-100/green-100/red-50).
- Cross-project roll-up for admin/老總 later via the existing mission-control surface (v22) — out of v1 scope.

---

## 5. SIGNING FLOW ON PHONE (合資格人士手機簽署)

Reuses the PTW approver flow (`src/components/ptw/PtwApproverBar.tsx` lines 104-115: `submit_approval` → `record_ptw_signoff`) minus the multi-step chain — periodic forms are single-signer:

1. **Open the form**: scan equipment QR (→ `verify_equipment_jwt`, scan audited) or pick from register / tap reminder deep-link.
2. **Checklist**: render `template.checklist` (same `PtwChecklistItem` shape) — tick items, add remarks, attach photos (compress-on-upload, warn >5MB per CLAUDE.md).
3. **Result**: 合格 / 合格(有備註) / 不合格.
4. **Step-up**: `await requireStepUp('form_signoff')` — warm 5-min grant skips the modal (StepUpContext lines 13-15: grants are multi-use), so a QP signing 6 machines in one walk types ONE TOTP code. AAL2-bound identity per v52.
5. **Signature**: `PtwSignaturePad` → base64.
6. **Commit**: `supabase.rpc('record_form_signoff', {...})` — server re-checks membership, credential validity, step-up grant; writes the signoff; `audit_ledger` trigger hash-chains it (tamper-evident, `verify_integrity()`).
7. **Paper bridge**: client generates the approved-form PDF replica (jspdf, existing `export.ts` stack) with the drawn signature embedded → uploads to storage → `pdf_path`; QP can print and post it on the scaffold/machine as the statutory display copy.
8. **Fail path**: `result='fail'` → instance `suspended=true`, equipment shows ⛔ 停用, safety_officer + PM pushed; optionally auto-open an Issue through the existing escalation chain (open decision §7.6).

---

## 6. ROLES (8 roles × forms domain)

| Role | Register/instances | Sign forms | Dashboard | Credentials |
|---|---|---|---|---|
| `admin` | full (admin-bypass RPC pattern, v12) | only with own valid credential | all projects | verifies |
| `pm` (assigned) | create/edit | only with credential | full | verifies |
| `main_contractor` | create/edit | only with credential | full | — |
| `safety_officer` 安全主任 | create/edit; **owns QR tag lifecycle + reminder default recipient** | only with credential (many SOs are CP-qualified) | **primary user** | verifies |
| `general_foreman` 老總 | read | only with credential | full (the "boss view") | — |
| `subcontractor` 判頭 | read | **yes if credentialed** — the common Form 5 case: 棚judge's own CP signs fortnightly | own equipment | uploads own |
| `subcontractor_worker` | read/scan only | no (unless credentialed — rare) | no | uploads own |
| `owner` 業主 | read | no | counts only | — |

**Qualification is data, not role**: signing rights come from a **verified, in-date `user_credentials` row matching `template.required_credential`** — enforced inside `record_form_signoff` (server), surfaced in UI as a disabled sign button with reason. Verification of a credential is itself a step-up-gated, audit-logged act by admin/PM/safety_officer (they eyeball the uploaded cert — the app does not validate against any government registry; none exists publicly). External CE/RPEs join as `project_members` with any role + a `competent_examiner` credential (see §7.3).

---

## 7. OPEN DECISIONS (需要你拍板)

1. **Paper strategy** — confirm with your safety consultant: is an e-record + printed PDF replica acceptable for LD inspections, with the printed copy displayed on the equipment? (Plan assumes YES; the statute says report "in the approved form" and e.g. Form 5 displayed on the scaffold — pure-digital-only is NOT assumed.)
2. **v1 template seed** — proposal: `CSSR-F5` (棚架14日), `LALG-F1` (升降台/吊機週檢), `LALG-F5` (12個月CE檢驗), `SWP-WEEKLY` + `SWP-6M` (吊船), `CSSR-F4` (掘地7日). Which does your site actually run today? Anything to add/cut?
3. **External competent examiners** — invite the visiting RPE into the app as a project member (clean identity-bound signature; needs onboarding), OR let the PM record the exam with the paper cert photo attached (`payload.photos`) and a "代錄" marker (no QP e-signature)? Recommend: support both, prefer the former.
4. **QR tag ownership** — who prints/laminates/affixes/replaces? Proposal: 安全主任, with a "列印全部 QR" A6-sheet PDF generator in the app.
5. **Step-up class** — new `'form_signoff'` class (proposed; lets you enforce forms before/after other classes) vs reusing `'approval'`. Both work under the v54 flag.
6. **Fail behaviour** — auto-create an Issue (existing escalation: 判頭→總承建商→PM) on `result='fail'`, or just suspend + push? Recommend auto-Issue.
7. **Reminder windows** — default T-3 days + on-expiry + weekly-while-overdue. Per-template override needed? (Weekly forms probably want T-1, not T-3.)
8. **QR token TTL** — 12-month JWT (re-print campaign yearly) vs non-expiring with `iat`-only (verify path always live-checks anyway). Recommend 12 months as a forced tag-refresh hygiene loop.
9. **AI assist (optional, fits "ai-form-2026")** — Supabase Edge Function (Deno) `form-ocr`: photo of a completed paper form → **claude-sonnet** (vision) extracts checklist values to pre-fill `payload`; **claude-haiku** extracts cert_no/expiry from uploaded credential photos. On-demand only (free-tier friendly); no OpenAI. Include in v1 or defer?

---

## 8. PHASED BUILD PLAN

| Phase | Scope | Tag |
|---|---|---|
| **F0 — Decision gate** | Resolve §7 with the user; lock v1 template seed + frequencies (re-verify the ⚠-flagged ones: LALG-F3 crane re-test interval, SWP form numbers, Cap 470 intervals, Cap 56 air receiver) | **[Fable=plan/review]** |
| **F1 — Migration v55** | `v55-equipment-forms-schema.sql`: 6 tables + RLS + `next_equipment_ref` + `record_form_signoff` + dashboard RPC + `app_config.equipment_qr_secret/forms_enabled` + audit_ledger attach **(+ the `permit_versions` watch-list fix)** + template seed. Apply via SQL editor per memory note (verify by EXECUTION not source) | **[Opus=execute]** |
| **F2 — Register + signing UI** | `types.ts` additions, `EquipmentContext`, `EquipmentList/Detail` pages, checklist renderer, `PtwSignaturePad` + `requireStepUp('form_signoff')` wiring, credential upload/verify screens, PDF replica via jspdf. Mobile-first 390px + BlueStacks check | **[Opus=execute]** |
| **F3 — QR layer** | `mint_equipment_jwt`/`verify_equipment_jwt` (+ scan page reuse), per-equipment QR card, "print all QR" A6 sheet | **[Opus=execute]** |
| **F4 — Reminders + dashboard** | `drain_form_reminders` + `form_reminders_sent` + cron, batched pushes through `push_dispatcher`, dashboard counts screen | **[Opus=execute]** |
| **F5 — Verification** | RLS smoke (denial directions: worker can't sign, uncredentialed PM can't sign, direct INSERT into form_signoffs denied, cross-project read denied), daily-site-sim event "判頭CP行Form 5圈", `verify_integrity()` after sign-offs, step-up on/off matrix | **[Haiku=debug]** |
| **F6 — AI assist (optional)** | Edge Function `form-ocr` (claude-sonnet vision pre-fill), credential OCR (claude-haiku); eval set = 10 photographed real forms | **[Fable=plan] → [Opus=execute] → [Haiku=debug]** |

Rollout: ship dark behind `forms_enabled=false` → seed one pilot project → flip per-project later if needed (flag is global v1, per-project is a column away).

---

## Appendix A — Reused existing assets (verified in code)

| Asset | Where | Reused for |
|---|---|---|
| `permit_signoffs` + `record_ptw_signoff` | `supabase/v10-ptw-schema.sql` §3, `v10-split/4-record-ptw-signoff-rpc.sql` | `form_signoffs` + `record_form_signoff` (same RLS `with check (false)`, same b64 signature, same length≥100 guard) |
| `mint_ptw_jwt` / `verify_ptw_jwt` / `permit_scans` | v10 §9-10, `src/lib/ptw-jwt.ts` | `mint_equipment_jwt` / `verify_equipment_jwt` / `equipment_scans` |
| `audit_ledger` + `verify_integrity()` | `supabase/v51-audit-ledger-tamper-evidence.sql` | trigger attach to 4 new tables; fixes missing `permit_versions` |
| `assert_step_up` / `mint_step_up_grant` / rollout flag | v52 / v53 / v54, `src/contexts/StepUpContext.tsx` | new class `form_signoff` |
| `push_dispatcher` (3/day cap + digest) | `supabase/v9-split/1-push-dispatcher.sql` | reminder + fail-alert pushes |
| `active_role_holders` | `supabase/v9-rls-helpers.sql` (used v10 line 430) | reminder recipient resolution |
| pg_cron pattern | v10 §14 `'ptw-expiry'` | `'form-reminder-sweep'` |
| `next_ptw_number` | v10 §7 | `next_equipment_ref` |
| `PtwSignaturePad`, `QrCard` (qrcode.react), scan page | `src/components/ptw/` | signing + QR UI |
| `green_card_no/expiry` precedent | `src/types.ts` lines 28-29 (v48) | generalized into `user_credentials` |
| jspdf export stack | `src/lib/export.ts` | approved-form PDF replicas |

## Appendix B — Sources

- [Cap 59I Construction Sites (Safety) Regulations](https://www.elegislation.gov.hk/hk/cap59I) · [LD Part VA scaffold guide](https://www.labour.gov.hk/eng/public/os/A/PartVA.pdf) · [LD excavation guide](https://www.labour.gov.hk/eng/public/os/A/Excv.pdf) · [CSSR Form 4](https://www.labour.gov.hk/text_alternative/pdf/eng/cssrf4.pdf) · [LCQ7 scaffolding (Jul 2025)](https://www.info.gov.hk/gia/general/202507/30/P2025073000261.htm) · [CoP Bamboo Scaffolding Safety](https://www.hkifm.org.hk/public_html/2020_doc/LD_Code%20of%20Practice_BS%20Safety.pdf)
- [LD Guide to FIU(LALG) Regs](https://www.labour.gov.hk/eng/public/os/A/FIU_LALG_ENG.pdf) · [LALG-F1](https://www.labour.gov.hk/eng/form/os/pdf/LALG-F1.pdf) · [LALG-F5](https://www.labour.gov.hk/eng/form/os/pdf/LALG-F5.pdf) · [LALG-F7](https://www.labour.gov.hk/eng/form/os/pdf/LALG-F7.pdf) · [LD LA/LG examination guidance](https://www.labour.gov.hk/eng/public/os/C/gear.pdf)
- [LD MEWP guidance notes](https://www.labour.gov.hk/eng/public/os/C/EWP.pdf) · [升降台 Form 1 trade guide](https://blog.renteasyhk.com/%E5%8D%87%E9%99%8D%E5%8F%B0form-1/) · [MEWP operator training (trade)](https://blog.renteasyhk.com/mewp-operator-license-guide/)
- [Cap 59AC SWP Regulation](https://www.elegislation.gov.hk/hk/cap59AC) · [CoP SWP](https://www.labour.gov.hk/eng/public/os/B/platform.pdf) · [LD SWP examination guidance](https://www.labour.gov.hk/eng/public/os/C/SWP.pdf) · [LD Cap 59AC guide](https://www.labour.gov.hk/eng/public/os/A/SWPreg.pdf)
- [Cap 470 Builders' Lifts & Tower Working Platforms](https://www.elegislation.gov.hk/hk/cap470) · [EMSD registered contractors (Cap 470)](https://www.emsd.gov.hk/filemanager/en/content_608/20260401%20RC-BLTWP-ENG.pdf)
- [EMSD periodic test for fixed electrical installations](https://www.emsd.gov.hk/en/electricity_safety/periodic_test_for_fixed_electrical_installations/index.html) · [1823 FAQ inspection frequency](https://www.1823.gov.hk/en/faq/how-often-should-fixed-electrical-installations-be-inspected-and-tested)
