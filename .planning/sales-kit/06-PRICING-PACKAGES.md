# 06 — Pricing & Packages

## Pricing Philosophy

- **Per project flat rate**, not per seat. Construction firms have variable staff per project; per-seat punishes growth.
- **HK$ pricing in zh-HK contracts**, not USD. Buyers feel safer with local currency.
- **Annual discount 15%** for upfront paid. Cashflow + commitment.
- **1-month pilot $0**. Lower friction to first try.

## 3 Tiers

| | **Pilot** | **Standard** | **Pro** | **Enterprise** |
|---|---|---|---|---|
| **HK$/month** | **0** | **3,800** | **9,800** | **Quote** |
| **Billing cycle** | 1 month only | Monthly OR annual | Monthly OR annual | Annual contract |
| **Annual discount** | — | 15% (HK$38,760/yr) | 15% (HK$99,960/yr) | 15-20% |
| **Active projects** | 1 | 1 per subscription | Unlimited | Unlimited |
| **User accounts** | 10 | 50 | Unlimited | Unlimited |
| **Drawings storage** | 1 GB | 10 GB | 100 GB | Custom |
| **PTW signatures/month** | 50 | 500 | Unlimited | Unlimited |
| **OneSignal push** | Limited (Free tier ~10k/mo) | Same | Custom subscription | Custom |
| **Custom PDF report** | ❌ | 1/month | Unlimited | Unlimited |
| **Excel export** | ✅ | ✅ | ✅ | ✅ |
| **WhatsApp / Email support** | ✅ | ✅ | ✅ | ✅ |
| **Monthly review call** | ❌ | ❌ | ✅ | ✅ |
| **On-site training** | ❌ | ❌ | 1 / quarter | Unlimited |
| **Custom feature ask** | ❌ | Vote on roadmap | Vote + bump priority | Quoted as project |
| **SLA** | None | Best effort | 99.5% uptime | 99.9% uptime + DPA |
| **Dedicated account manager** | ❌ | ❌ | ❌ | ✅ |
| **Data residency choice (HK region)** | ❌ | ❌ | ✅ | ✅ |
| **DPA / NDA signed** | Template | Template | ✅ Custom | ✅ Custom |

## What's included in ALL tiers

- v1.1 security + UX (RLS hardening, account deletion, materials urgent toggle, zone prefixes, slider chips, etc.)
- iOS App Store + Android Play Store + Web access
- All roles (admin / pm / general_foreman / main_contractor / subcontractor / subcontractor_worker / owner / safety_officer)
- All features (progress tree / daily / materials / events / contacts / drawings / SI / VO / PTW / issues)
- Realtime updates
- PDF + Excel export
- Account deletion (Apple compliance)
- Chinese (zh-HK) UI

## Discount Levers (use sparingly)

- **Founding customer discount**: 25% off Standard for first 12 months for any client who signs before 2026-06-30.
  - Sign price: HK$2,850/月 instead of HK$3,800. Locks the price.
  - Use to close hesitant Tier 1 buyers in the first 30 days.
- **Annual upfront discount**: 15% off. Save the cashflow gap.
- **Referral credit**: HK$2,000 OR 1 month free for each successful new customer they refer who signs Standard tier or above.
- **Volume discount**: HK$3,400/月 (vs 3,800) for 3+ concurrent projects on Standard. Effectively pushes them toward Pro.

## DO NOT discount

- Pilot is already $0 — don't extend free trial beyond 1 month without firm commitment date.
- Don't give exclusive features for free as a trade. Roadmap is for the whole customer base.
- Don't offer "we'll match competitor X" — race to bottom.

---

## ROI Math (use in pitch slide 3 or close)

### Scenario: Small GC, 1 active site, 5 staff using app

**Cost**: HK$3,800/月 = HK$45,600/year

**Savings (conservative)**:
| Item | Old way | With CK工程 | Savings/year |
|---|---|---|---|
| PM time chasing daily reports | 2hr/day × HK$300/hr × 250 work days | -75% = 0.5 hr/day | **HK$112,500** |
| Lost disputes due to no paper trail | 1 case / year × HK$50,000 settle | Avoided | **HK$50,000** |
| Onboarding new foreman | 2 weeks × HK$1,800/day | 3 days | **HK$19,800** |
| Material delays caught late | 4 cases × HK$5,000 idle wages | 1 case caught early | **HK$15,000** |
| **Total annual savings** | | | **HK$197,300** |

**ROI**: 4.3x in year 1. Net savings: HK$151,700.

Use these numbers in pitch. Adjust ratios if specific client has different scale.

### Scenario: Mid GC, 3 active sites

**Cost (Pro tier)**: HK$9,800/月 = HK$117,600/year

**Savings**: ~3x of above = HK$591,900/year.

**ROI**: 5x in year 1. Net: HK$474,300.

### Scenario: Per-zone Tier 4 mandate

Property developer mandates CK工程 across all their projects' GCs. 10 GCs × HK$3,800/月 = HK$456,000/year billed to GCs (developer doesn't pay; they're the channel).

Developer benefit: real-time visibility, fewer disputes.
Your benefit: 10x customer count from one referrer.

---

## Contract templates (1-page only)

### Pilot Letter of Engagement (Pilot tier — 1 month $0)

```
CK工程 Pilot Engagement

Client: [Firm name]
Pilot start: [Date]
Pilot end: [Date + 30 days]
Pilot scope:
  - 1 active project ([project name])
  - Up to 10 user accounts
  - All v1.1 features

Cost: HK$0 for pilot period.

After pilot:
  - Continue on Standard tier (HK$3,800/月) — auto-renews monthly
    unless cancelled in writing 7 days before period end.
  - OR cancel — accounts deactivated, all data exported (PDF + Excel)
    within 7 business days, then deleted.

Service:
  - WhatsApp standby support (English / zh-HK).
  - Monthly 30-min review call at pilot end.

Data:
  - Stored on Supabase managed Postgres, Singapore region.
  - Client owns all data input. CK工程 has no resale rights.

Confidentiality:
  - Both parties hold each other's commercial info in confidence.

Termination:
  - Either party may terminate with 7 days written notice during pilot.

Signed:
[Client]: ___________________  Date: _______
[CK工程]: __________________  Date: _______
```

### Standard Subscription (Standard tier)

```
CK工程 Subscription Agreement — Standard Tier

Client: [Firm name]
Start: [Date]
Subscription: HK$3,800/月 per project (or HK$38,760/year prepaid annual)
Billing: Monthly via bank transfer / FPS / cheque

Includes:
  - 1 active project
  - Up to 50 user accounts
  - 10 GB drawings storage
  - 500 PTW signatures/month
  - WhatsApp support
  - 1 custom report/month
  - All v1.1 features

Auto-renew: Yes. 30 days written notice to cancel.
Refund: Pro-rata for current month if cancellation. No refund for
  past months billed.

Data:
  - Singapore region by default.
  - HK region upgrade available (Pro tier).
  - Data exported on cancellation (PDF + Excel + JSON).
  - Retained 90 days post-cancellation for accidental restore, then deleted.

SLA:
  - Best effort uptime. No guaranteed SLA on Standard tier.

Liability cap: 3x monthly subscription fee.

Confidentiality + IP: Standard mutual NDA terms.

Signed:
[Client]: ___________________  Date: _______
[CK工程]: __________________  Date: _______
```

### Pro Tier — same template + addendum:
- 99.5% uptime SLA
- HK region data residency
- Monthly review call
- 1 on-site training/quarter
- Liability cap: 12x monthly fee
- Custom DPA available on request

## Payment methods

- **FPS / bank transfer** preferred (no fees)
- HSBC/Hang Seng/SCB business accounts
- **Cheque** OK for older clients but slow
- **Stripe** for international clients (cards) — fees ~3% you absorb or pass on
- **NOT accept**: 數 / WeChat Pay HK (compliance), cash, crypto (yet)

## Invoicing rhythm

- Standard: monthly on 1st, due 14 days net
- Pro: monthly on 1st, due 30 days net  
- Enterprise: as agreed (typically quarterly upfront)
- Late > 30 days → friendly reminder. > 45 days → account suspension warning. > 60 days → suspend access, data export sent.

---

## Mental model for objections

When client says "too expensive":

→ Don't lower price first. Anchor against alternative cost.

> 「3,800 一個月. 但你哋而家 PM 浪費喺追 daily 嘅 2 小時 × 5,000 一個月 wage × 22 工作日 = $1,800. 仲未計上次 dispute 賠咗幾錢. 」

When client says "no budget":

→ Offer to defer.

> 「OK. 1 個月 pilot 完全 $0. 月底如果你覺得真係 save 到時間，再決定簽唔簽. 點都唔逼.」

When client says "I'll think about it":

→ Set follow-up firmly.

> 「明白. 下星期五前我 follow up. 期間如果有 questions 隨時 WhatsApp 我.」  
→ Send WhatsApp 2 hours later: "BTW, this video shows the daily flow I mentioned: [Loom link]."

---

## Summary one-pager (give to every prospect)

A4 size. Top half: pricing table. Bottom half: ROI math + contact info.

Print on quality 80gsm paper. Always bring 10 copies to any in-person meeting.
