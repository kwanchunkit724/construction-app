# Feature Research

**Domain:** Hong Kong construction site-control software (drawings, SI/VO, PTW)
**Researched:** 2026-05-11
**Confidence:** MEDIUM-HIGH (regulatory citations HIGH; competitor feature mapping MEDIUM; HK on-site behaviour MEDIUM from prior industry context)

## Scope Reminder

Already shipped (do NOT re-research): zones, hierarchical progress, 問題, RBAC, push.

In scope for this milestone:
1. **Drawings** attached to leaf `progress_items` (Phase 1)
2. **SI / VO** project-level approval workflow (Phase 2)
3. **PTW** project-scoped permits with safety_officer role (Phase 3)

## HK Regulatory Anchor

Three regulations frame what PTW *must* be able to evidence — these are non-negotiable because the app's value proposition for PTW is "stand up as evidence in a Labour Department investigation".

- **Cap. 59I — Construction Sites (Safety) Regulations** — overarching scaffold (Form 5 fortnightly inspection), excavation, lifting operations, working at height duties.
- **Cap. 59AC — Confined Spaces Regulations** + **revised 2024 Code of Practice for Safety and Health at Work in Confined Spaces** (gazetted 31 May 2024, effective 30 November 2024) — formal Permit-to-work Certificate template, risk-assessment template, air-monitoring alarm settings, shortened safety-certificate validity for 認可工人 / 合資格人士.
- **Factories and Industrial Undertakings (Loadshifting Machinery) Regulation** — lifting/吊運 plant operator certification.
- Hot work (動火) — no single statute; governed by site fire-precaution clauses and insurer requirements. Industry-standard permit nonetheless because insurers and developers (MTRCL, HKHA, Gammon internal HSE) all require it.

PTW in this app is a **paper-trail substitute** that mirrors the Labour Department's certificate template, not a regulator-recognised replacement.

## Feature Landscape

### Table Stakes (Users Expect These — Reject the App if Missing)

#### 1. Drawings on Progress Items

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Multiple drawings per leaf item** | One leaf item (e.g., 3/F slab rebar) routinely references arch + structural + MEP sheets | LOW | Already in schema (`drawings.progress_item_id FK`) |
| **Revision label (Rev A / Rev B / Rev C)** | Drawings re-issued constantly; foreman must instantly see "this is the latest" | LOW | `drawings.revision text` already in schema. Sort DESC by `created_at` and badge newest as 最新 |
| **Pinch-zoom mobile viewer** | Foreman in PPE + dusty gloves squinting at a 5.5" phone needs zoom to read 1:100 dimensions. Non-negotiable. | MEDIUM | `react-zoom-pan-pinch` (already planned). Lazy-load to keep bundle <1.8MB |
| **PDF rendering** | 80%+ of HK drawings issued as PDF (some still TIFF/DWG export). PDF first. | MEDIUM | `pdfjs-dist` worker, lazy-loaded. Render single page at a time on mobile |
| **Private storage with project-member RLS** | Drawings are commercially sensitive (rates, layouts). A public bucket leak = lawsuit. | LOW | Mirror `can_view_project`; `issue-photos` public bucket is NOT the template to copy |
| **Upload gated by role** | Workers should not be able to upload a fake "revised" drawing | LOW | Edit gated to `pm` / `main_contractor` / assigned PM (mirror `ProgressContext.canEdit`) |
| **Download / share via OS sheet** | Foreman wants to AirDrop / WhatsApp drawing to a worker without app account | LOW | Capacitor `Filesystem` + `Share` plugins |
| **File-size warning on upload** | Site Wi-Fi is bad; 50MB PDFs over LTE = abandon | LOW | Warn >5MB, hard-block >25MB. Storage budget reason (Supabase Free 1GB) |
| **Drawing title + uploader + timestamp visible in viewer** | Audit-trail credibility. "Who uploaded this?" is the first question in a dispute | LOW | Already in schema (`uploaded_by`, `created_at`) |

#### 2. SI / VO Workflow

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **SI auto-numbering per project (SI-001, SI-002...)** | Site convention; SI numbers are referenced in payment claims & monthly valuations | LOW | DB sequence or trigger; per-project counter |
| **SI title + description + photos** | The verbal-instruction paper trail. Captures *what was said* on site. | LOW | `attachments jsonb` already in schema |
| **SI issuer = MC, recipient = subcon (judgement: trade-specific)** | 主判 issues to 分判. Without this directionality the doc is meaningless. | LOW | Issuer = current user (gated to MC/PM), recipient = subcon company picker from `project_members` |
| **VO references its originating SI** | A VO without an SI is a cash grab. Inspectors / QSes won't process it. | LOW | `variation_orders.si_id` already in schema |
| **VO itemised quotation (labour / material / preliminaries / contingency)** | Industry standard. Single-figure VOs get rejected by QS at month-end | MEDIUM | Per Key Decision: structured rows not single field. Sub-table `vo_line_items (vo_id, category enum, description, qty, unit, rate, amount)` |
| **VO totals in HKD with 2 dp** | Locked to HKD per Constraints | LOW | `numeric(14,2)` |
| **Status machine: draft → submitted → approved/rejected** | Mirrors paper flow; subcon must see where their claim is stuck | LOW | Already in schema |
| **Approval chain configurable per project** | Some contracts require Architect signoff, some don't; different developers have different chains | MEDIUM | Per Key Decision. Table `project_approval_chains (project_id, doc_type, step_order, approver_role)` |
| **Push notification on SI issued / VO submitted / VO approved-rejected** | Otherwise nobody sees it. WhatsApp won this battle because it pings. | LOW | DB trigger fan-out per `v5-split/` pattern |
| **PDF export of single SI / VO** | Required for monthly valuation submission + arbitration evidence | MEDIUM | `jspdf` already in bundle. Include site logo, SI number, timestamps, signatures-as-audit-rows |
| **Read-only after approval (lock)** | The whole point of audit trail. Editable approved VOs = no audit value. | LOW | RLS update policy `where status not in ('approved','rejected')` |

#### 3. PTW

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Permit type selector with HK-specific labels** | 動火 / 高空 / 吊運 / 密閉空間 / 掘地 / 電力 / 棚架 — exact terms safety officers expect | LOW | Schema has 7 types; UI for top 3 first per PROJECT.md |
| **Validity window (valid_from / valid_to)** | Cap. 59I + confined-space CoP require explicit dates/times on the certificate | LOW | Already in schema. Default `valid_to = today 18:00` |
| **Same-day expiry by default (no overnight permits)** | Per Out of Scope: "each day = new permit". Matches LD CoP "permit issued for each shift". | LOW | UI default; allow override only with safety_officer confirm |
| **Signoff chain: subcon foreman (申請人) → safety officer (簽發) → MC site agent (核准)** | Three-signature flow is the industry baseline. Without all three, permit has no evidential weight. | MEDIUM | `permit_signoffs` table already in schema. Enforce order via app + RLS |
| **Safety officer is a distinct global role** | Per Key Decision. PMs and safety officers have different liability under Cap. 59AC. | LOW | Add `safety_officer` to `GlobalRole` enum + RLS helper |
| **Risk-assessment checklist per permit type** | 2024 CoP mandates checklist; confined-space permit explicitly requires air-monitoring alarm settings recorded | MEDIUM | JSON checklist template per type stored in code (not DB) so updates ship with releases |
| **Photo evidence at signoff** | "Show me the gas-meter reading", "show me the harness anchor". Safety officers won't sign without it. | LOW | `attachments jsonb` already in schema |
| **QR code on active permit posted at work area** | Industry-standard practice; LD inspectors scan or check posted permit. Workers verify they're under a live permit. | MEDIUM | Generate QR linking to `/project/:id/ptw/:ptwId`. `qrcode` npm pkg, lazy-loaded |
| **Auto-expire end of day** | Per Constraints / Out of Scope: prevents stale permits | LOW | Client-side derived from `valid_to`; later Edge Function for server-side state transition |
| **Close-out step: completion confirmation + housekeeping check** | LD CoP requires "make safe" sign-off after work. Hot work = 30-min fire watch logged. | MEDIUM | New `closed` status + `closed_by` + `closeout_notes`. Hot-work-specific 30-min countdown UI |
| **Read-only audit archive (forever)** | Accident investigation can come 2-3 years later. Archive must survive project closeout. | LOW | Soft-delete only; no destructive deletes on `permits_to_work` |

### Differentiators (Competitive Edge vs Procore / Paper / WhatsApp)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Drawing pin: tap a leaf progress item, see exactly which drawing covers it** | Procore / Aconex have drawings + progress as separate worlds. Linking them at the leaf is the unique value. | LOW | Already in chosen architecture (drawings FK to `progress_items`) — capitalise on it in UX |
| **SI → drawing reference inline** | "See drawing A-301 Rev C" is the most common phrase in an SI. Make it a tappable link, not free text. | MEDIUM | SI body picker that inserts `{{drawing:uuid}}` tokens; viewer resolves them. Cross-phase dependency: Drawings must ship first |
| **VO line-item → progress-item reference** | Connects cost to physical work. QSes love this; subcons love this. Nobody else does it. | MEDIUM | `vo_line_items.progress_item_id` nullable FK |
| **WhatsApp-style notification preview for SI** | Compete with WhatsApp directly. Push body contains the SI title + first line of description so users don't need to open the app to triage. | LOW | OneSignal payload tuning |
| **Subcon "I disagree" annotation on SI without blocking** | Verbal-instruction disputes need a non-confrontational way to record "I did this under protest". Stops 扯皮 at month-end. | LOW | `si_comments` table; comment kind = `protest` shown in PDF export |
| **Permit type 3 (吊運) integrates with lifting-plan upload** | HK Gammon/Leighton-style differentiator. Lifting plan PDF attached to the permit, with crane operator licence number recorded. | MEDIUM | Reuse drawings storage bucket pattern |
| **Permit "live now on site" dashboard widget** | Site agent walks the site; phone shows: "5 permits active right now, here's where". Beats clipboard. | LOW | New Dashboard card; filter `status='active' and now() between valid_from and valid_to` |
| **Bilingual PDF export (zh-HK / en) for SI/VO/PTW** | LD inspectors prefer English; subcon workers prefer Chinese. Toggle at export. | MEDIUM | Translation tables already pattern in `src/types.ts` — extend |
| **Activity feed: "PTW-014 動火 approved by 陳安全 5 mins ago"** | Mirrors site-wide situational awareness. Existing dashboard timeline pattern extends naturally. | LOW | Already have activity timeline component |
| **Offline-aware upload queue for drawings/permits** | Site basements have no signal. Capacitor + IndexedDB queue + retry. Procore mobile does this; paper has always done this; WhatsApp does this. | HIGH | Defer to v1.x unless a foreman complains in Phase 1 UAT |

### Anti-Features (Deliberately NOT Built — and Why)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Drawing markup / annotation tools** | "Procore has it, why don't we?" | Markup state, layer management, conflict resolution = its own 4-week project. Bundle bloat. Adds review-loop scope. | View-only v1. Foreman screenshots + uploads to 問題 if they need to mark something up. Promote markup to its own phase if/when users ask. |
| **Drawing OCR / search inside drawings** | Power-user request | PDFs in HK construction are often scanned at low DPI; OCR accuracy 60-70%. Builds false expectation. | Filename + title + revision search only. |
| **VO multi-currency** | Mainland contractors sometimes invoice in RMB | FX rate locking, audit trail of which rate, rounding rules — a quarter of engineering for a tiny share of jobs | HKD only per Constraints. Subcons convert and document outside the app. |
| **SI / VO retroactive entry (backdate)** | "I forgot to log it yesterday, let me put it in" | Backdated entries undermine the trust value of the paper trail. If anyone can backdate, the audit log is worthless in arbitration. | App-time stamps authoritative. If genuinely missed, log today with a note "instructed verbally on YYYY-MM-DD". |
| **Real-time collaborative SI / VO drafting** | "Google Docs but for VO" | Conflict resolution, presence indicators, op-transform. Single-author drafts are 95% of real usage. | Single-author drafts; submit → others can comment. |
| **Permit auto-renewal across days** | "Same crew doing the same hot work tomorrow, why re-sign?" | Stale-permit risk. LD CoP intent is that each shift gets fresh risk assessment + atmosphere check. Auto-renewal directly contradicts the regulation's purpose. | Each day = new permit. "Duplicate yesterday's permit as today's draft" is acceptable IF safety officer must re-sign atmosphere checks. |
| **Permit types 4–7 UI (密閉空間, 掘地, 電力, 棚架)** | "Schema is there, why not build the UI?" | Each type has type-specific checklists (confined space alone has 12+ items per 2024 CoP). Build by demand. | Schema ready; UI stub renders 敬請期待 placeholder. Add one type per quarter based on usage data. |
| **VO approval chain with parallel approvers (architect AND QS both sign)** | Procore supports it | Adds approval-state combinatorics (any-of vs all-of vs majority). HK contracts almost always sequential. | Sequential chain only. Architect-then-QS not Architect-and-QS. |
| **Export to MS Project / Primavera** | Big GCs ask | Separate integration phase; XML schema headaches; tiny usage. | Out of scope; defer. |
| **In-app drawing comparison (overlay Rev A on Rev B)** | "Bluebeam does this" | High GPU cost on mobile; Capacitor WebView struggles. Bluebeam is desktop-first for a reason. | Side-by-side viewer at most, in a future phase. |
| **Per-line-item subcon comment on VO during approval** | "We want to negotiate per line" | Turns a status-machine doc into a thread. UX becomes Slack. | One overall comment per status transition. Negotiation happens on-site or by phone; outcome captured as a new VO revision. |
| **Drawing markup with layered annotations from multiple users** | Future request | See above — same reason as basic markup, compounded. | Out of scope indefinitely. |
| **PTW SMS notifications (not just push)** | "Foreman doesn't open app often" | SMS costs money per message; pager pattern; OneSignal already covers push. | Fix push UX (notification copy, sound). If still not opened, escalate via in-app red badge + foreman dashboard. |

## HK Industry Pain Points — How These Features Address Them

| Pain Point | Today's Workaround | This Milestone's Answer |
|------------|--------------------|-------------------------|
| **Verbal instruction fraud** — MC tells subcon to do extra work, denies it at billing | WhatsApp screenshots, paper site diary | SI with timestamp + issuer + push notification = un-deniable. Subcon "protest" comment for non-blocking disagreement. |
| **Phantom manpower / phantom work** — claims for work not done | PM site walks, photo-by-photo memory | Drawings linked to leaf progress items + photo evidence on issues — already structurally addressed by existing app. This milestone adds VO line items linkable to specific progress items. |
| **主判/分判 blame loop on accidents** — "subcon didn't follow procedure" vs "MC didn't provide permit" | Paper PTW books, often missing | Digital PTW with safety_officer signoff + photo evidence + immutable archive. The MC site agent's signature is captured with timestamp. |
| **Drawing revision confusion** — work done to Rev A after Rev B issued | WhatsApp groups, paper drawing room | Latest-revision badging; push notification on new drawing upload; revision shown on viewer header. |
| **Month-end VO 扯皮** — line-item disputes a month later | Excel sheets, scanned-handwritten quotations | Structured VO line items (labour/material/prelim/contingency); read-only after approval. |
| **Stale permits / "we always do it this way"** | Paper permit books, often pre-signed in advance | Same-day expiry default; no auto-renewal; each shift requires fresh atmosphere check / signoff. |
| **Drawing leaks to competitors** | Email forwards, USB sticks | Private Supabase Storage bucket + project-member RLS; downloads tracked in `created_at` log (extend later). |

## Feature Dependencies

```
Drawings (Phase 1)
    ├──unblocks──> SI inline drawing references (Phase 2)
    ├──unblocks──> VO line-item drawing references (Phase 2)
    └──unblocks──> PTW lifting-plan / scaffold-drawing attachments (Phase 3)

safety_officer global role (Phase 3 prerequisite)
    └──required by──> PTW signoff chain

Progress items (already shipped)
    ├──FK from──> Drawings
    ├──optional FK from──> SI.related_progress_item_id
    └──optional FK from──> VO line items

project_members + can_view_project / can_edit_project_progress (already shipped)
    └──RLS template for──> drawings, SI, VO, PTW tables
```

### Dependency Notes

- **Drawings before SI/VO**: SIs reference drawings ("see A-301 Rev C") constantly. Without drawings shipped, SI body is plain text only — losing 50% of the differentiator value.
- **safety_officer role before PTW**: New global role must be added with full RLS coverage *before* PTW UI. Account-deletion compliance (Apple Guideline 5.1.1(v)) must also cover the new role.
- **Approval-chain configuration before SI/VO approval UI**: Without configurable chains, every project must use the same flow, which fails on Architect-required contracts.
- **Bundle splitting before PDF viewer**: Bundle already 1.2 MB; PDF + zoom libs push to ~1.8 MB. Lazy-load required before, not after, drawings ships.

## MVP Definition (per phase)

### Phase 1 — Drawings MVP

- [ ] Upload PDF/image to leaf item (private bucket + RLS)
- [ ] List drawings for a leaf item with revision label + uploader + timestamp
- [ ] Pinch-zoom viewer (lazy-loaded)
- [ ] Edit gated to PM/MC; view for all project members
- [ ] Push notification on new drawing upload to project
- [ ] File-size warning >5MB
- [ ] Latest-revision badge

### Phase 2 — SI/VO MVP

- [ ] SI create with auto-number + title + description + photo attachments
- [ ] SI recipient = subcon company (from project_members)
- [ ] SI inline drawing reference (depends on Phase 1)
- [ ] VO creates from an SI; line items table (category/desc/qty/unit/rate/amount)
- [ ] Status machine: draft → submitted → approved/rejected
- [ ] Configurable approval chain (per project)
- [ ] Push notifications on status transitions
- [ ] PDF export (single SI / single VO)
- [ ] Read-only lock after approved/rejected
- [ ] Subcon "protest" comment on SI (differentiator)

### Phase 3 — PTW MVP

- [ ] Add `safety_officer` global role; account-deletion coverage
- [ ] PTW create for top 3 types (動火 / 高空 / 吊運); types 4-7 stub
- [ ] Per-type risk-assessment checklist (JSON in code)
- [ ] Signoff chain: subcon foreman → safety officer → MC site agent
- [ ] Photo evidence at each signoff step
- [ ] Validity window with same-day default; no overnight
- [ ] Status: pending → approved → active → expired/closed
- [ ] Close-out step with notes (and 30-min fire-watch countdown for 動火)
- [ ] QR code on approved permit
- [ ] Dashboard "live permits now" widget
- [ ] Read-only archive (no destructive delete)
- [ ] Push notifications on status transitions

### Add After Validation (v1.x)

- [ ] Offline upload queue for drawings & permit photos
- [ ] Bilingual PDF export toggle (zh-HK / en)
- [ ] Permit types 4–7 UI (one per quarter based on demand)
- [ ] Drawing comparison (side-by-side)
- [ ] Activity feed entries for drawing uploads

### Future Consideration (v2+)

- [ ] Drawing markup / annotation (its own milestone)
- [ ] Drawing OCR / search
- [ ] MS Project / Primavera export
- [ ] Multi-currency VO
- [ ] Multi-party real-time draft collaboration

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Drawing pinch-zoom viewer | HIGH | MEDIUM | P1 |
| Drawing revision label + latest badge | HIGH | LOW | P1 |
| Drawing private bucket + RLS | HIGH | LOW | P1 |
| SI auto-numbering | HIGH | LOW | P1 |
| VO itemised quotation table | HIGH | MEDIUM | P1 |
| Configurable approval chain | HIGH | MEDIUM | P1 |
| Read-only lock after approval | HIGH | LOW | P1 |
| safety_officer global role | HIGH | LOW | P1 (Phase 3 prerequisite) |
| PTW signoff chain (3 signers) | HIGH | MEDIUM | P1 |
| PTW close-out step | HIGH | MEDIUM | P1 |
| QR code on permit | MEDIUM | MEDIUM | P1 |
| Same-day permit expiry default | HIGH | LOW | P1 |
| SI inline drawing reference | HIGH | MEDIUM | P2 |
| VO line-item → progress-item link | MEDIUM | MEDIUM | P2 |
| Subcon protest comment | MEDIUM | LOW | P2 |
| Live-permits dashboard widget | MEDIUM | LOW | P2 |
| Bilingual PDF export | MEDIUM | MEDIUM | P3 |
| Offline upload queue | HIGH | HIGH | P3 (v1.x) |
| Drawing markup | MEDIUM | HIGH | P3 (defer) |
| Drawing OCR | LOW | HIGH | P3 (defer) |

## Competitor Feature Analysis

| Feature | Procore | Aconex / Autodesk Build | HKCA / Paper / WhatsApp | Our Approach |
|---------|---------|--------------------------|-------------------------|--------------|
| Drawing versioning | Yes (sheet publishing from Revit) | Yes (full doc control) | Paper revision stamps | Lightweight `revision text` + uploaded_by + created_at; latest-badge in UI |
| Drawing markup | Yes (web + iPad) | Yes | Marker pen on paper | View-only v1; markup deferred |
| Drawing linked to progress | Weak (issues link to sheets, progress is separate) | Weak | None | **Differentiator**: drawings FK to leaf progress items |
| Variation tiers | Up to 3-tier with potential-VO grouping | Yes | Excel + scanned signatures | Single-tier with line items + configurable approver chain; sufficient for HK 主判/分判 |
| Variation per-line negotiation | Yes (commitment variation comments) | Yes | Phone calls | Anti-feature — one comment per transition only |
| Claimable VOs (pending billable) | Yes (2025 Procore feature) | n/a | Side-letters | Out of scope; addressed via read-only-after-approval + protest comment |
| PTW | Not domain-specific in Procore | Workflow-able but generic | Paper permit book | HK-specific: 7 permit types in HK terminology + safety_officer role + 2024 CoP-aligned checklists |
| Mobile-first | Yes (PlanGrid heritage) | Mixed | n/a | Yes (Capacitor; mobile is primary UX) |
| Bilingual zh-HK / en | Limited; mostly English | Limited | n/a | Primary zh-HK with bilingual export differentiator |
| Cost (entry tier) | USD ~$375/user/mo for full | USD-tier enterprise pricing | Free (paper) / WhatsApp free | Our app: 0 marginal cost per user, Supabase Free tier (1GB) |

## Quality-Gate Self-Check

- [x] Categories clear (Table Stakes / Differentiators / Anti-Features each in own section with tables)
- [x] HK Labour Department PTW requirements referenced (Cap. 59I, Cap. 59AC + 2024 Confined Spaces CoP, gazette date 31 May 2024, effective 30 Nov 2024)
- [x] HK industry pain points addressed (verbal-instruction fraud, phantom manpower, 主判/分判 blame loop, drawing-revision confusion, month-end VO 扯皮, stale permits) — dedicated section
- [x] Dependencies identified (Drawings unblocks SI/VO inline references; safety_officer role prerequisite for PTW; approval-chain config before SI/VO approval UI; bundle splitting before viewer)

## Sources

- [Cap. 59I — Construction Sites (Safety) Regulations (Hong Kong eLegislation)](https://www.elegislation.gov.hk/hk/cap59I) — HIGH confidence
- [Revised Code of Practice for Safety and Health at Work in Confined Spaces gazetted (31 May 2024)](https://www.info.gov.hk/gia/general/202405/31/P2024053000259.htm) — HIGH confidence
- [Revised Code of Practice for Safety and Health at Work in Confined Spaces effective 30 Nov 2024](https://www.info.gov.hk/gia/general/202411/29/P2024112800261.htm) — HIGH confidence
- [Labour Department Code of Practice for Confined Spaces PDF](https://www.labour.gov.hk/eng/public/os/B/space.pdf) — HIGH confidence
- [Construction Site Safety Handbook (mtpinnacle reprint of LD handbook)](http://www.mtpinnacle.com/pdfs/handbook_e.pdf) — MEDIUM confidence (third-party host)
- [Labour Department guide under Part VA of Construction Sites (Safety) Regulations](https://www.labour.gov.hk/eng/public/os/A/PartVA.pdf) — HIGH confidence
- [Procore Variations tool user guide (UK)](https://en-gb.support.procore.com/products/online/user-guide/project-level/change-orders) — MEDIUM (vendor docs)
- [Procore variation tiers configuration](https://en-gb.support.procore.com/products/online/user-guide/project-level/commitments/tutorials/configure-the-number-of-commitment-change-order-tiers) — MEDIUM
- [Procore What's New (Claimable Variations 2025)](https://www.procore.com/whats-new) — MEDIUM
- [Autodesk Build / Forma construction drawing management](https://construction.autodesk.com/tools/construction-drawing-management/) — MEDIUM
- [Oracle Aconex review (BuildXL)](https://www.buildxl.com/aconex-construction-management-review/) — LOW (third-party review)
- HK on-site dynamics (主判/分判, 扯皮, phantom manpower, verbal instructions) — MEDIUM confidence, sourced from existing PROJECT.md industry context section; not independently re-verified this round

---
*Feature research for: HK construction site-control (Drawings + SI/VO + PTW)*
*Researched: 2026-05-11*
