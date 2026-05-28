# 01 — Customer Profiles (Who Pays?)

## Primary Persona — 老總 / Site Director (decision maker)

| Field | Detail |
|---|---|
| Title | 老總 / Site Director / General Foreman / Construction Manager |
| Age | 45-60 |
| Comfort with tech | Low to medium. Uses WhatsApp daily, Excel sometimes. |
| Pain (decreasing severity) | 1. Disputes with subcontractors — no paper trail, lose money in arbitration. 2. Office-to-site info lag — PM hears about overdue material days late. 3. WhatsApp screenshot chaos when a contractor demands records. 4. New foreman onboarding — takes months to learn "the way we record things". 5. Compliance audits — paper diaries get water/dust/lost. |
| Budget authority | HK$5,000-50,000/month for software, no procurement committee at small/medium GCs. Large GCs require formal vendor onboarding. |
| Decision speed | 2-6 weeks. Will try one project as pilot. |
| Buying triggers | a) Just lost a dispute and paid out compensation. b) New regulator audit upcoming. c) Bigger project won — old paper system can't scale. d) Lost a senior foreman who took knowledge with them. |
| Decision style | Demo + 1-month pilot on small zone. NOT spec sheets. |

## Secondary Persona — PM / Project Manager (champion)

| Field | Detail |
|---|---|
| Title | 項目經理 / PM / Project Engineer |
| Age | 30-45 |
| Comfort with tech | Medium-high. Uses Excel, PowerPoint, sometimes Notion. |
| Pain | 1. Spends 2 hrs/day chasing foremen for daily reports. 2. Office-side dashboards stale by Friday afternoon. 3. Cross-zone confusion — "which 座 was that issue?" 4. Manual report compilation for client owner. 5. Late material deliveries undetected until workers stop. |
| Role in deal | Champion. Will demo to 老總. Will run the pilot. |
| Hot buttons | "If I could see all 4 zones in one dashboard..." / "If foreman daily report came in automatically..." / "If PTW signoff was on phone, not chasing 5 paper signatures..." |

## Tertiary Persona — 判頭 / Subcontractor Boss

| Field | Detail |
|---|---|
| Title | 判頭 |
| Age | 35-55 |
| Pain | 1. Material delays from GC — workers idle, pays out wages with no work done. 2. Dispute over what was promised vs delivered. 3. Junior workers don't update progress, gets surprised at month-end. |
| Buying role | Recommender. May push 老總 to adopt if you sell them on the 物料 + 逾期 alert feature. |
| Important note | Most 判頭 will NOT pay directly — they're 1-tier-down user. But happy 判頭 = retained subcon = bigger GC adoption. |

## Buyer Firm Types — by size

### Tier 1 — Small GC (5-30 staff, 1-3 active sites)
- **Target this tier first**. Fastest sales cycle, owner-decides, no procurement.
- Sweet spot pricing: HK$3,000-8,000/month.
- Examples (publicly known names): 關春傑工程, smaller renovation contractors, MTR sub-system specialists, fit-out firms.
- Sales cycle: 2-4 weeks.
- Where to find: Construction Industry Council (CIC) member directory, HK Trade Development Council exporter list, BCA Industry Directory.

### Tier 2 — Mid GC (30-150 staff, 3-10 sites)
- Real money. Have a "head office" admin doing Excel-based tracking. Hate it.
- Sweet spot pricing: HK$10,000-30,000/month per company (multi-project).
- Examples of firm type: Specialist subcontractor majors (M&E, 棚架, 地基, 機電) running multiple projects under different main contractors.
- Sales cycle: 6-10 weeks. Pilot 1 project, then expand.
- Where: BCA Hong Kong member list, RICS HK chapter, HKCA (HK Construction Association) member directory.

### Tier 3 — Large GC (150+ staff, 10+ sites)
- Long sales cycle. Procurement, IT, compliance, legal involved.
- Need: SOC 2 readiness, signed data processing agreement, integration with their existing ERP (likely Cubicost / Glodon / SAP).
- Examples: 信和建築, 新昌營造, 金門建築, 中國建築 (中建), 保華建業.
- Sales cycle: 6-12 months. Possibly never. Aim for one pilot project at a time.
- Skip this tier in first 6 months — focus T1 and T2.

### Tier 4 — Property Developers (your **boss customer**)
- Don't sell to them as software. Sell to them as **transparency layer** for their projects.
- They mandate vendors use it. You bill the GC, but developer is referrer.
- Examples: 新鴻基, 信和, 恒基, 新世界, 嘉里, 會德豐.
- Approach: aim for 1 friendly developer staff (project director). One success there opens dozens of GCs.

## Personas to NOT target (yet)

- Government bodies (HK Housing Authority, MTRC, Civil Engineering Development Dept) — public tender pain, 12-18 month sales cycles, requires HKID-bound tender registration. Skip until v2.0.
- Owner-operator small landlords renovating own building — too small.
- Architectural firms — they bill differently, not their pain.
- Mainland China firms — different regulatory + market, would need full re-localization (簡體 / WeChat / SaaS pricing different).

## Buying signals to listen for

1. "Last month we lost HK$XX,XXX in a dispute…"
2. "My foreman 黃師傅 retired and we don't know how he tracked things…"
3. "Client owner asked for status report and I had to chase 5 people…"
4. "The 棚架 invoice came in $200K higher than expected because we didn't track…"
5. "We just won a big tender, but my paper system can't handle 4 zones…"
6. "I have to be on site, but I want to know what's happening from office…"

These all map directly to the app's core value. When you hear one, **stop pitching and ask follow-up questions**. They're already sold; you just need to remove friction.

## How they currently solve it (your competition)

| Solution | Why it doesn't work | Your edge |
|---|---|---|
| WhatsApp group | Screenshots, no structure, no audit, message limits | Structured + persistent + cross-project searchable |
| Excel + Email | Office-only, foreman doesn't update, version chaos | Real-time, mobile-first, foreman updates with thumbs |
| Paper site diary | Lost / water-damaged / illegible | Time-stamped, exportable, dispute-proof |
| Cubicost / Glodon | Quantity surveying, NOT daily ops | We do the dailies. Integrate later. |
| Procore (US) | $1,800/mo per user, English-only, USA workflow | zh-HK, HK terms (PTW / SI / VO), HK$1,500/mo flat |
| Generic CRM / Asana / Monday | No 工地 vocabulary, no PTW, no 判頭 hierarchy | Built for HK construction from day 1 |

## Trust signals you carry

- **You already shipped a production app** (App Store v1.0 → v1.1, Play Store closed alpha)
- **Apple compliance passed** (account deletion, security review)
- **Live production user (yourself / 關春傑工程)** — case study
- **HK-specific** terminology: PTW / SI / VO / 判頭 / 老總 / 棚架
- **Pricing is fixed HK$ per project**, not per-seat-trap-USD

Lead with these in first conversation.
