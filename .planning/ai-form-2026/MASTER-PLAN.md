# MASTER-PLAN — AI 站長 × 地盤表格管理 — Integrated Execution Plan

**Author:** Fable (lead architect) · **Date:** 2026-06-13
**Inputs:** `AI-ASSISTANT-PLAN.md` (AI 站長, per-project assistant) + `FORM-SIGNING-PLAN.md` (statutory forms + e-signing)
**Status:** EXECUTION-READY pending §3 decisions. Execution by **Opus** (code), debugging by **Haiku**, plan/review gates by **Fable**.
**Execution rule:** each task below is atomic; Opus must not start a task whose `Depends` is unmerged. Migrations are applied via the Chrome SQL editor and **verified by EXECUTION, not source** (memory note).

---

## 0. Why one plan

Both features independently claimed migration **v55**, both add an `app_config` rollout flag, both extend the v51 `audit_ledger` watch-list, both lean on v52–v54 step-up, both use `push_dispatcher`, and both add a tab to `ProjectDetail.tsx` + types to `src/types.ts`. Built separately they collide; built together the form/equipment data becomes the AI's best analysis input, and the AI becomes the forms system's reminder/insight surface. This plan resolves the collisions, sequences the work, and consolidates every decision the user must make.

---

## 1. SHARED INFRASTRUCTURE & INTEGRATION

### 1.1 Collision resolutions (binding)

| Conflict | Resolution |
|---|---|
| Both plans claim `v55` | **v55 = `v55-equipment-forms-schema.sql`** (forms ships first, see §5). **v56 = `v56-ai-assistant.sql`**. All references in the source plans renumber accordingly. |
| `permit_versions` audit bug (v51 watches nonexistent `ptw_versions`) | Fixed **once, in v55** (forms migration already carries it). v56 must NOT re-add it; v56 only appends `ai_actions` to the watch loop (the loop is idempotent, but one owner per fix). |
| `app_config` flags | Two flags, same get/set RPC pattern: `forms_enabled` (v55), `ai_assistant_enabled` (v56). Both default **false** (ship dark). |
| Step-up classes | v55 adds `'form_signoff'`; AI adds **no new class** — it reuses existing classes per tool (`approval`, `document`, `progress_delete`, `membership`). Client `StepUpActionClass` + `ACTION_CLASS_ZH` get one combined edit (in F-phase, AI phase only consumes it). |
| `ProjectDetail.tsx` Tab union & `src/App.tsx` routes | Single ordering decision now: `Tab` gains `'equipment'` (v55 UI phase) then `'assistant'` (AI UI phase). Whoever lands second rebases; tasks 2.3 and 5.3 are flagged as the only true file-level conflicts between the two lanes. |
| `src/types.ts` | Both append blocks. Forms block lands first (`FormTemplate`, `Equipment`, …), AI block second (`AiAction`, `AiMessage`, …). Append-only, low conflict. |
| Edge Functions | `supabase/functions/ai-assistant/` (chat agent) and `supabase/functions/form-ocr/` (vision pre-fill) are **separate functions sharing one `ANTHROPIC_API_KEY` secret and one `ai_usage` metering table** (defined in v56; form-OCR therefore depends on v56 even though forms UI doesn't). |

### 1.2 Shared rails (build once, both features consume)

| Rail | Already exists | Forms uses it for | AI uses it for |
|---|---|---|---|
| RLS helpers `can_view_project` / `can_edit_project_progress` / `active_role_holders` (v9) | ✅ | All 6 new tables' policies; reminder recipients | Capability resolver (tool exposure filter) |
| `audit_ledger` hash chain (v51) | ✅ | `equipment_register`, `form_instances`, `form_signoffs`, `user_credentials` | `ai_actions` proposal trail |
| Step-up AAL2 (`assert_step_up`, v52–v54) | ✅ | `record_form_signoff` (`form_signoff`), `verify_user_credential` (`membership`) | Confirm cards on D4/D5, S4, S10, P7, C4 |
| `push_dispatcher` 3/day cap + digest (v9-split) | ✅ | Daily reminder batch; fail-alerts | (optional, deferred) morning-brief push |
| pg_cron (`ptw-expiry` precedent, v10) | ✅ | `form-reminder-sweep` 07:30 HKT | (optional, deferred) scheduled brief |
| JWT mint/verify + scan audit (`mint_ptw_jwt`, v10) | ✅ | `mint_equipment_jwt` / `verify_equipment_jwt` / `equipment_scans` | — (AI never mints from raw paths) |
| `PtwSignaturePad`, `PtwQrCard`, scan page | ✅ | Form signing + QR | — (AI is forbidden to sign; deep-links only) |
| jspdf / `src/lib/export.ts` | ✅ | Approved-form PDF replicas | Weekly-report export handoff |
| `ai_usage` budget metering | ❌ NEW in v56 | `form-ocr` token spend | Assistant token spend — **one table, one admin view, one ceiling** |
| HashRouter deep links `#/project/:id/...` | ✅ | Reminder push deep-link → equipment screen | Answer cards + suggest-only actions → same routes |

### 1.3 Integration opportunities (the reason to co-plan)

1. **AI surfaces form expiry.** The AI plan's "expiry radar" (A4) currently covers `permits_to_work.expires_at`, `documents.review_due_date`, `green_card_expiry`. Add **`form_instances.valid_until` + `suspended` + `user_credentials.valid_until`** to the same read tool. One new read tool: `get_forms_dashboard(project_id)` — the exact RPC the forms dashboard already needs. Zero extra backend work; the AI just calls it.
2. **Forms dashboard feeds whole-site analysis (A1/A5).** Morning brief gains: 「⛔ 升降台#2 停用 (Form 1 不合格) · 🔴 2 張棚紙過期 · 🟡 吊船 6個月檢驗餘 5 日」. This is the single highest-value AI output for the 老總/安全主任 persona and it costs one tool call.
3. **AI answers 「邊個可以簽 Form 5?」** — read tool over `user_credentials` (verified, in-date, matching `required_credential`) joined to project members. Pure read, RLS-visible to approvers already (§6 of forms plan).
4. **AI never signs, but escorts.** `record_form_signoff` carries a wet signature + credential check ⇒ same class as S8: **deep-link-only**. The AI's job: 「升降台#2 Form 1 今日到期 — [去簽署]」. The suggest-only card pattern (AI plan §3, symbol L) is reused verbatim.
5. **Fail → Issue → AI.** If decision §3-D6 = auto-create Issue on `result='fail'`, the AI's existing open-issues tools pick it up with no extra wiring — failed inspections automatically appear in the morning brief and in I6 stale-issue nudges.
6. **Form-OCR shares the AI stack.** `form-ocr` Edge Function (sonnet vision pre-fill, haiku credential OCR) reuses the v56 `ai_usage` meter, the JWT-forwarding client pattern, and the secret. It is an AI-lane task that delivers forms-lane value — scheduled after both foundations exist.
7. **One sim suite.** daily-site-sim gains two event scripts — 「判頭CP行Form 5圈」 and 「判頭叫AI刪大項(must refuse)」 — run together in every verification phase, both lanes.

---

## 2. UNIFIED ROADMAP

Lanes: **F** = Forms, **A** = AI, **X** = shared/integration. Solo founder executes top-to-bottom; the ⇄ marks show what genuinely parallelizes if running two Opus worktrees (no shared files except where flagged in §1.1).

### Phase 0 — Decision gate + contract freeze (½–1 day) — BLOCKS EVERYTHING
| # | Task | Tag | Depends |
|---|---|---|---|
| 0.1 | User resolves §3 decisions (this doc) — record answers inline | [Fable=plan/review] + user | — |
| 0.2 | Re-verify ⚠-flagged statutory frequencies (LALG-F3 crane re-test, SWP form numbers, Cap 470/Cap 56 intervals) before seeding | [Fable=plan/review] | 0.1 |
| 0.3 | Freeze: AI tool registry JSON-schema + risk classes + role filter spec; v55/v56 table DDL; renumbering per §1.1 | [Fable=plan/review] | 0.1 |

### Phase 1 — Forms foundation (week 1, lane F)
| # | Task | Tag | Depends |
|---|---|---|---|
| 1.1 | **v55 migration**: 6 tables + RLS (`with check (false)` on signoffs/scans) + `next_equipment_ref` + `record_form_signoff` (credential check + `assert_step_up('form_signoff')`) + `get_forms_dashboard` + flags/secrets + audit attach **+ permit_versions fix** + template seed (per 0.1 D-F2). Apply via SQL editor; verify by EXECUTION | [Opus=execute] | 0.3 |
| 1.2 | Denial smoke on live DB: direct INSERT to `form_signoffs` denied; uncredentialed signer refused; cross-project read denied; `verify_integrity()` green after a test signoff | [Haiku=debug] | 1.1 |

### Phase 2 — Forms register + signing UI (week 1–2, lane F) ⇄ Phase 3
| # | Task | Tag | Depends |
|---|---|---|---|
| 2.1 | `types.ts` forms block; `EquipmentContext` (realtime `equipment-${projectId}`); credential upload/verify screens | [Opus=execute] | 1.1 |
| 2.2 | `EquipmentList` (register + dashboard counts) + `EquipmentDetail` (instances, checklist renderer, `PtwSignaturePad`, `requireStepUp('form_signoff')`, PDF replica via jspdf) | [Opus=execute] | 2.1 |
| 2.3 | Tab `'equipment'` in `ProjectDetail.tsx` + route in `App.tsx` (**conflict point with 5.3 — lands first**); 390px + BlueStacks pass | [Opus=execute] [Haiku=debug] | 2.2 |
| 2.4 | zh-HK copy pass + role matrix review (§6 forms plan) | [Fable=plan/review] | 2.2 |

### Phase 3 — AI foundation (week 1–2, lane A) ⇄ Phase 2 (no shared files)
| # | Task | Tag | Depends |
|---|---|---|---|
| 3.1 | **v56 migration**: `ai_conversations`, `ai_messages`, `ai_actions`, `ai_usage`, `ai_assistant_enabled` + get/set, append `ai_actions` to audit loop. Apply + verify by execution | [Opus=execute] [Haiku=debug] | 0.3 (NOT on 1.1 — but apply after v55 to keep numbering honest) |
| 3.2 | Edge Function `ai-assistant` skeleton: JWT-forwarding client, SSE relay, `ANTHROPIC_API_KEY` secret, ping tool, 8-iter/30s caps | [Opus=execute] | 3.1 |
| 3.3 | Capability resolver (per-request role → tool registry filter) | [Opus=execute] | 3.2 |

### Phase 4 — Forms reminders + QR (week 2, lane F)
| # | Task | Tag | Depends |
|---|---|---|---|
| 4.1 | `drain_form_reminders` + `form_reminders_sent` + cron `form-reminder-sweep`; batched via `push_dispatcher`; T-3/T-0/weekly-overdue stages | [Opus=execute] [Haiku=debug] | 1.1, 2.2 |
| 4.2 | QR layer: `mint_equipment_jwt`/`verify_equipment_jwt` (12-month token per D-F4), per-equipment QR card, 「列印全部 QR」A6 PDF; verify screen shows 有效/過期 LARGE | [Opus=execute] | 1.1, 2.2 |
| 4.3 | Forms verification: daily-site-sim event 「判頭CP行Form 5圈」, step-up on/off matrix, reminder dedup check | [Fable=plan/review] scenarios, [Opus=execute] harness, [Haiku=debug] | 4.1, 4.2 |
| 4.4 | **Pilot flag-on**: `forms_enabled=true` on one project; real QP signs a real Form 5 | [Fable=plan/review] gate | 4.3 |

### Phase 5 — AI read-only assistant (week 2–3, lane A + X)
| # | Task | Tag | Depends |
|---|---|---|---|
| 5.1 | Read tools: progress/timetable/materials/issues/documents/contacts/dailies/pending-reviews **+ `get_forms_dashboard` + credential-holder lookup (§1.3-1,3)** | [Opus=execute] | 3.3, 1.1 |
| 5.2 | Manual tool loop: sonnet default, opus for 分析, haiku router, prompt caching, trimmed tool results | [Opus=execute] | 5.1 |
| 5.3 | Chat UI: tab `'assistant'`, thread persistence, streaming bubbles, document card (**rebases over 2.3**) | [Opus=execute] | 3.1, 2.3 |
| 5.4 | Eval set: 30 zh-HK questions × 3 roles asserting visibility slices (判頭 must NOT see full tree; forms dashboard respects RLS) | [Fable=plan/review] spec, [Opus=execute], [Haiku=debug] | 5.2 |

### Phase 6 — AI actions with confirmation (week 3–4, lane A)
| # | Task | Tag | Depends |
|---|---|---|---|
| 6.1 | `proposed_action` SSE + `ai_actions` persistence + args-hash confirm round-trip | [Opus=execute] | 5.2 |
| 6.2 | Medium-risk tools (timetable, progress tick, daily log, issue create/comment, materials, contacts, review-due-date) + `ActionConfirmCard` (risk badges, typed-confirm destructive variant) | [Opus=execute] | 6.1 |
| 6.3 | **Suggest-only deep links: PTW sign (S8/S9), membership (C4), and `record_form_signoff` (§1.3-4)** | [Opus=execute] | 6.1 |
| 6.4 | Denial-direction live sim: 判頭→add/delete 大項 refused at layer 1 AND layer 3; 工人→order materials refused; AI→sign form refused (tool absent) | [Fable=plan/review] scenarios, [Opus=execute], [Haiku=debug] | 6.2, 6.3 |

### Phase 7 — AI high-risk + step-up (week 4, lane A)
| # | Task | Tag | Depends |
|---|---|---|---|
| 7.1 | High-risk tools (escalate/resolve issue, add/edit/assign 大項, SI/VO/PTW drafts+submit) ; step-up-wired tools (doc approve/withdraw, chain approve, chain edit) behind `requireStepUp` | [Opus=execute] | 6.4 |
| 7.2 | P7 delete behind `progress_delete` + typed confirm | [Opus=execute] | 7.1 |
| 7.3 | Prompt-injection red-team (hostile issue titles / equipment names / form remarks attempting tool triggers — forms payloads are now an injection surface too) | [Fable=plan/review], fixes [Haiku=debug] | 7.1 |
| 7.4 | Security review vs v51/v52/v53 invariants before any flag-on | [Fable=plan/review] gate | 7.3 |

### Phase 8 — Analysis polish + OCR + rollout (week 5)
| # | Task | Tag | Depends |
|---|---|---|---|
| 8.1 | Opus analysis prompts: morning brief **including forms/credential expiry + suspended equipment (§1.3-2)**, progress-vs-planned, 停工等料, weekly report → export.ts | [Fable=plan/review] prompts, [Opus=execute] | 5.4, 4.4 |
| 8.2 | Budget meter (`ai_usage`) + polite refusal + admin usage view (covers assistant AND form-ocr) | [Opus=execute] [Haiku=debug] | 6.1 |
| 8.3 | `form-ocr` Edge Function: sonnet vision pre-fill of checklist payloads; haiku credential OCR. Eval = 10 photographed real forms | [Fable=plan] spec, [Opus=execute], [Haiku=debug] | 3.2, 2.2, decision D-F7 |
| 8.4 | **Pilot flag-on**: `ai_assistant_enabled=true` on the same pilot project; 390px + BlueStacks pass; App Store note (server-side AI, no new data collection) | [Fable=plan/review] gate | 7.4, 8.1, 8.2 |

**Critical path:** 0 → 1 → 2 → 4 → (forms live) and 0 → 3 → 5 → 6 → 7 → 8 → (AI live). Phases 2⇄3 and 4⇄5 parallelize across worktrees; everything else is sequential. Forms can be **live in production at end of week 2** without a single AI line shipped.

---

## 3. CONSOLIDATED KEY DECISIONS (user must answer before Phase 1)

Grouped; defaults are what Opus builds if the user says 「照你建議」.

**D-X1 · Provider & budget (AI).** Anthropic-only confirmed? Per-user/day ceiling (default: ~HK$8/user/day, alert 80%) + global monthly cap. Who absorbs cost — eaten, or a paid-tier feature for the HKICT pitch? *Default: Anthropic-only, HK$8/day, absorbed during pilot.*
**D-X2 · Confirm vs auto (AI).** Any mutations auto-execute without a card (candidates: comments, contacts, daily log)? *Default: EVERYTHING confirms in v1; revisit with a month of `ai_actions` data.* Sub-decision: 工人/業主 suggest-only globally? *Default: keep the small ✓ set (issue create, own tick, daily log).*
**D-X3 · AI execution ceiling.** SI/VO approval (S4) and membership approval (C4) via AI: execute-behind-step-up from day one, or suggest-only first? *Default: suggest-only in v1; promote after 7.4 review.*
**D-X4 · Rollout order & pilot.** Confirm: forms first, AI second, same pilot project, both flags dark until their gate task passes. *Default: yes.*
**D-F1 · Paper strategy (forms).** Confirm with safety consultant: e-record + printed PDF replica displayed on equipment is acceptable for LD inspections? **This is the only decision that can invalidate the forms feature — answer it first.** *Plan assumes yes.*
**D-F2 · v1 template seed.** Proposed: CSSR-F5 (棚架14日), CSSR-F4 (掘地7日), LALG-F1 (週檢), LALG-F5 (12月CE), SWP-WEEKLY + SWP-6M. Which does the site actually run? *Default: those six.*
**D-F3 · External competent examiners.** Onboard visiting RPE as project member (real e-signature) vs PM 代錄 with cert photo? *Default: support both, prefer onboarding.*
**D-F4 · QR vs alternatives.** QR primary (laminated, 12-month JWT, 安全主任 owns print/affix/replace), NFC rejected, list-pick always works as fallback? *Default: yes as stated.*
**D-F5 · Qualification verification.** Credential = uploaded cert photo, eyeball-verified by admin/PM/安全主任 (step-up gated, audit-logged); no government registry check exists. Acceptable trust model? *Default: yes; revisit if LD ever publishes a registry API.*
**D-F6 · Fail behaviour.** `result='fail'` → suspend + push only, or also auto-create an Issue into the existing escalation chain? *Default: auto-Issue (it also feeds the AI brief for free, §1.3-5).*
**D-F7 · Form-OCR in v1?** Include task 8.3 or defer to next milestone? *Default: include — it shares infra already built by then and is the demo-magic moment.*
**D-A1 · Voice input.** Capacitor speech plugin + Info.plist strings = new App Store review surface. *Default: defer out of v1 entirely.*
**D-A2 · Thread retention.** Keep `ai_messages` forever (audit value) vs auto-purge after N days? *Default: keep 180 days, then purge; `ai_actions` kept forever (it's hash-chained).*
**D-A3 · Morning-brief push.** Scheduled pg_cron + OneSignal push of the AI brief, or pull-only chat? *Default: pull-only v1 (push budget + opus cost).*
**D-F8 · Reminder windows.** T-3/T-0/weekly-overdue default; per-template override (weekly forms want T-1)? *Default: add `remind_before_days` per template, seed weekly forms at 1.*

---

## 4. RISK TABLE

| # | Risk | Lane | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R1 | LD/safety consultant rejects e-record + printed replica → forms feature legally hollow | F | Low-Med | **Critical** | D-F1 answered before Phase 1; paper-bridge PDF is mandatory in v1; e-record positioned as management layer, not statutory original |
| R2 | AI token cost blowout (opus analysis loops, free-tier-minded budget) | A | Med | High | `ai_usage` hard ceiling per user/day; prompt caching; sonnet default + haiku router; opus only on 分析 intents; budget meter ships in Phase 8 BEFORE flag-on |
| R3 | Prompt injection via user-authored content (issue titles, equipment names, form remarks) triggers a harmful proposal | A | Med | High | `<site_data>` wrapping; **structural backstop: no mutation without human confirm card + step-up on high-risk**; red-team task 7.3 is a gate |
| R4 | RLS bypass / cross-role leak through AI tools | A | Low | **Critical** | JWT forwarding (no service-role key for domain writes); tool exposure filter; denial-direction sims at layers 1 AND 3 (5.4, 6.4); 7.4 security gate |
| R5 | Migration collision / wrong numbering (both plans claimed v55) | X | Was certain | Med | Resolved §1.1: v55 forms, v56 AI; permit_versions fix lands once in v55 |
| R6 | QR tag read as proof of validity (expired form, green-looking laminated tag) | F | Med | High | Token authenticates the TAG only; verify screen reads status LIVE and shows 有效/過期 full-width; 12-month TTL forces re-print hygiene |
| R7 | Credential vouching is human-trust only (no registry); fake cert gets verified | F | Low-Med | High | Step-up + audit-logged verification act; `credential_snapshot` frozen per signoff for dispute forensics; D-F5 explicitly accepts the trust model |
| R8 | Supabase free-tier storage exhaustion (signature PDFs, checklist photos, cert photos on a drawing-dominated 1GB) | F | Med | Med | Compress-on-upload + >5MB warn (CLAUDE.md budget); PDF replicas are small; monitor before pilot widens |
| R9 | OneSignal cap breached by reminder sweep | F | Low | Med | All pushes through `push_dispatcher` (3/day cap + digest); one batched push per user per day; `form_reminders_sent` dedup |
| R10 | Edge Function wall-clock kills long tool loops mid-mutation | A | Med | Med | 8-iteration/30s cap; mutations are single confirmed calls (never inside long loops); confirm round-trip is a fresh short request |
| R11 | Solo-founder scope explosion (two features, 8 phases, one human) | X | **High** | High | §5 ordering: forms live end-of-week-2 standalone; every AI phase independently shippable; D-A1/D-A3 deferred; gates stop sunk-cost continuation |
| R12 | Seeded statutory frequencies wrong (⚠ LALG-F3, SWP numbering, Cap 470/56) | F | Med | Med | Task 0.2 re-verification gate; templates are admin-editable data, not code — fixable post-ship without migration |
| R13 | App Store review friction (new AI surface, voice plugin) | X | Low | Med | Server-side AI only, no new data collection note (8.4); voice deferred (D-A1); no new native plugins in v1 |
| R14 | Two-lane parallel work creates merge conflicts in `types.ts` / `ProjectDetail.tsx` / `App.tsx` | X | Med | Low | §1.1: forms lands tab/route first (2.3), AI rebases (5.3); types blocks append-only |

---

## 5. RECOMMENDATION — scope + order for a solo founder

**Build forms first, AI second. Do not interleave within a week.**

Reasoning, concretely:

1. **Forms is deterministic and sellable alone.** It is ~80% reuse of battle-tested PTW infrastructure (signature pad, JWT/QR, scan audit, step-up, cron, push dispatcher), zero marginal API cost, and it answers a statutory pain every HK contractor has TODAY (棚紙過咗期 = stopped work + LD fine). It can be live on the pilot project at the **end of week 2** (Phase 4.4) with no AI dependency. For the HKICT pitch it is the compliance story; the AI is the wow story — you want both, but compliance pays rent.
2. **AI gets strictly better by waiting two weeks.** Phase 5's read-only assistant launches with the forms dashboard already in its tool belt — the morning brief includes 停用 equipment and expiring 棚紙 from day one. Built in reverse, you'd retrofit the AI's best demo answer.
3. **Read-only AI is the correct first AI ship.** Phases 5 (read) → 6 (confirmed actions) → 7 (step-up actions) each end at a shippable, flag-gated state. If budget, time, or pilot feedback says stop, stopping after Phase 5 still leaves a genuinely useful product (Q&A + morning brief). Do NOT ship actions before the denial sims (6.4) and red-team (7.3) pass — these are the two gates that protect the v9–v54 security posture you've spent the year building.
4. **Cut from v1 without guilt:** voice input (D-A1), morning-brief push (D-A3), RAG/embeddings (rejected in AI plan §2.3), NFC (rejected in forms plan §3), AI execution of SI/VO/membership approvals (suggest-only, D-X3). Keep form-OCR (D-F7) — it's cheap by Phase 8 and demos brilliantly.
5. **The week-by-week shape:** W1 = Phase 0+1+start 2 (forms DB + denial smoke). W2 = finish 2+4, forms pilot live; start 3 in parallel only if energy allows (it's the one safe parallel pair). W3 = 5 (+5.4 eval gate). W4 = 6+7 (actions + security gates). W5 = 8 (analysis, budget meter, OCR, AI pilot live). Total: **5 weeks to both features live on one pilot project, with 4 hard review gates (1.2, 4.4, 7.4, 8.4) where stopping is cheap.**

---

## Appendix — renumbering deltas vs source plans

- `AI-ASSISTANT-PLAN.md` §6/§8 Phase 0.2: `v55-ai-assistant.sql` → **`v56-ai-assistant.sql`**; audit watch-list addition = `ai_actions` only (permit_versions fix belongs to v55).
- `FORM-SIGNING-PLAN.md` is unchanged except: its optional §7.9 AI-assist (form-OCR) is now roadmap task **8.3** and depends on the v56 `ai_usage` table + shared secret.
- AI plan Phase numbering maps: P0→3, P1→5, P2→6, P3→7, P4→8. Forms plan: F0→0, F1→1, F2→2, F3/F4→4, F5→4.3/6.4, F6→8.3.
