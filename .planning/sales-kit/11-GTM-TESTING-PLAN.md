# 11 — Go-To-Market Testing Plan

How to **reach** customers and **sell** the product — run as measurable
experiments, not guesses. Every stage has a hypothesis, an action, a metric,
and a go/no-go threshold. Track everything in `/#/mission` (Leads tab +
metrics). Market = HK Tier-1 small GC first (see `01-CUSTOMER-PROFILES`).

> Core idea: you don't "know" your sales pitch works yet. This plan **tests**
> it cheaply, finds what converts, and doubles down. Cost to run ≈ your time.

---

## 0. The funnel you are testing

```
REACH ──► REPLY ──► DEMO ──► PILOT (HK$0, 1 mo) ──► PAID (HK$3,800/mo)
 100       ~10        ~5          ~2-3                    ~1
```

Five stages. Each has a benchmark conversion you will measure against. The
numbers above are the **hypothesis** for 100 cold touches — your real numbers
replace them after Week 1.

| Stage | Metric (track in /mission) | Hypothesis (cold) | "Working" if ≥ |
|---|---|---|---|
| Reach → Reply | replies / outreach_sent | 10% | 7% |
| Reply → Demo booked | demos / replies | 50% | 35% |
| Demo → Pilot start | pilots / demos | 40% | 30% |
| Pilot → Paid | customers / pilots | 40% | 30% |

If any stage is far below threshold after enough volume → that's the stage to
fix (see §6 Decision gates). **Warm intros convert 3-5× cold — prioritise them.**

---

## Phase 0 — Pre-flight (do BEFORE any outreach, ~1 day)

Don't start cold until these are ready — each one lifts later conversion.

- [ ] **Record the 60-sec Loom demo** (judou 60001005 → daily → 急件 → switch PM → 4 zones). Paste link into `10-OUTREACH-DRAFTS` `[Loom]` slots. *Single biggest reply-rate lever.*
- [ ] **Polish your LinkedIn** — title "Founder, CK工程 — 地盤工程管理 app"; About = positioning one-liner; banner = app screenshot.
- [ ] **Print `/#/takeaway`** (A4, 80gsm) — 10 copies for in-person.
- [ ] **Build the 10-prospect list** (Tier-1). Columns: name, firm, role, channel (LinkedIn/WhatsApp), warm/cold, link sent, status. (Or just use the `/#/mission` Leads tab once they come in.)
- [ ] **Confirm the live assets open**: `/#/sell`, `/#/takeaway`, App Store link, web demo.
- [ ] **Set a daily slot** — 30 min/day for outreach (Tue–Thu PM HKT best).

---

## Phase 1 — REACH experiments (Week 1-2): find the channel that replies

Run **3-4 channels in parallel**, small volume each, same offer, so you learn
which channel + message gets replies. Each is an experiment.

### Exp A — Warm network (HIGHEST priority)
- **Hypothesis**: people who know you reply ≥40% and convert fastest.
- **Action**: list every 老總 / PM / 判頭 you or 關春傑工程 already know. Send `10-OUTREACH-DRAFTS` Script C (WhatsApp) personalised. Ask for the meeting OR a referral.
- **Volume**: all of them (likely 5-15). **Metric**: replies, demos.
- **Threshold**: if warm doesn't convert, the *product/pitch* is the problem, not reach — stop and fix the demo first.

### Exp B — LinkedIn cold DM
- **Hypothesis**: niche HK construction PMs reply ~10% to a no-pitch question.
- **Action**: search "項目經理 / 工地主任 / PM" + Hong Kong + construction. Send Script A (question-first, `/#/sell` link). 5/day.
- **Volume**: 25-40 over the 2 weeks. **Metric**: reply rate.
- **Threshold ≥7%** reply → keep; else test Script variant / different title.

### Exp C — Cold WhatsApp (numbers from CIC/HKCA directory or referrals)
- **Hypothesis**: WhatsApp out-replies LinkedIn for this audience (they live on WhatsApp).
- **Action**: Script C + `/#/sell`. Tue/Wed PM.
- **Volume**: 15-25. **Metric**: reply rate (expect higher than B).

### Exp D — Referral ask (judou channel)
- **Hypothesis**: a happy 判頭 will name 1-2 老總.
- **Action**: ask your subcontractors "邊個老總朋友都有 daily/PTW 痛點?" Script 6 framing.
- **Metric**: warm intros generated.

**Week-1 reach scoreboard** (log in /mission): outreach_sent per channel, replies per channel → **kill the bottom channel, double the top one** in Week 2.

---

## Phase 2 — SELL motion (per replying prospect)

Once someone replies with interest, run this fixed sequence. Tools: `05-DEMO-SCRIPT`, `06-PRICING`, `07-OBJECTIONS`, `04-PITCH-DECK` (PPTX).

### Step 1 — Qualify (2 min, in chat)
Ask 2 questions before booking: *"你哋而家 daily + PTW 點 record?"* and *"幾多個地盤 / 幾多人?"* → confirms Tier-1 fit + surfaces the pain to mirror in the demo.

### Step 2 — Demo (15-20 min, Zoom or in-person)
- Follow `05-DEMO-SCRIPT`. **Open with THEIR pain**, not features.
- The magic is the **live phone demo** (judou login → 30-sec daily → 急件 → switch to PM 4-zone view). Practise it 10× first.
- Use test accounts (60001001 PM / 60001005 judou, pw test1234).
- **End with one ask**: *"試一個月 $0,我幫你 set 一個 zone,月底傾。"*
- **Metric**: demo → pilot agreed (target ≥30%).

### Step 3 — Pilot (1 month, HK$0)
- Send `10-OUTREACH-DRAFTS` Script G + `/#/takeaway`. 1-page agreement (in `06-PRICING`).
- Scope: 1 project, ≤10 accounts, all features, you on WhatsApp standby.
- **You set it up** same week (lowers their friction → higher convert).
- Mid-pilot (Day 14) + end (Day 30) check-in — listen, don't pitch.
- **Metric**: pilot active, weekly usage (are they actually writing dailies?).

### Step 4 — Close to paid
- Day-28 review: replay the value THEY got ("daily 一直見到,office 唔使追").
- Offer **founding price HK$2,850/mo** (sign before 6/30, locks 12 mo).
- Handle objections with `07-OBJECTIONS` (anchor price vs PM's wasted hours; never drop price first).
- **Metric**: pilot → paid (target ≥30%).

---

## Phase 3 — 4-week sprint cadence

| Week | Reach | Sell | Weekly review (Fri, update /mission metrics) |
|---|---|---|---|
| **1** | Phase 0 done + launch Exp A-D (warm first) | First demos from warm replies | reply rate per channel; kill worst channel |
| **2** | 2× the winning channel | Demos + first pilots start | demo→pilot rate; is the demo landing? |
| **3** | Keep top channel; add 1 new (event / directory) | Run pilots; mid-pilot check-ins | pilot usage — are they using it daily? |
| **4** | Steady outreach | Day-28 reviews → close founding deals | pilot→paid; lock founding customers before 6/30 |

Target after 4 weeks (conservative): **30+ touches, 3+ demos, 1-2 pilots, 1 paying founding customer.** That 1 customer = proof + case study + referral source.

---

## 4. What to track (all in /#/mission)

- **Leads tab**: every inbound from `/#/sell` form + manually-added prospects. Move each through new → contacted → demo → pilot → won/lost.
- **Metrics (admin → 更新數字)**: outreach_sent, replies_received, demos_run, pilots_active, customers_signed, mrr_hkd. Update every Friday.
- **Chat log**: 1 line per week — what you learned, what to change.

This makes the funnel **visible** so you can see exactly which stage is leaking.

---

## 5. Benchmarks — is it actually working?

| Signal | Good | Worry | Action if "worry" |
|---|---|---|---|
| Cold reply rate | ≥7% | <3% over 30 sends | Rewrite Script A opener; test WhatsApp vs LinkedIn; wrong audience? |
| Demo booked from reply | ≥35% | <20% | Your reply→demo ask is weak; offer specific slots + Loom up front |
| Demo → pilot | ≥30% | <15% | Demo isn't landing — open with pain, shorten, do live phone part |
| Pilot daily usage | foreman writes daily 4+ days/wk | near-zero | Onboarding/training gap — go on-site, set it up for them |
| Pilot → paid | ≥30% | <15% | Value not felt — pick a sharper pilot scope, or price/objection issue |

---

## 6. Decision gates (kill / pivot rules)

- **After 30 cold touches, <2 replies** → reach problem. Change *one* variable: channel OR opener OR audience tier. Re-test 20. Don't change all 3 at once.
- **Replies but <1 demo per 5 replies** → your ask is weak. Lead with Loom + 2 fixed time slots.
- **Demos but no pilots** → demo problem. Re-watch your own demo; cut to <12 min; open with their pain quote. Practise 10×.
- **Pilots but no paid** → value/onboarding problem, NOT price. Make sure the foreman actually used it daily; if not, that's why. Fix onboarding before discounting.
- **Warm network converts but cold doesn't** → stay warm/referral-led for now; cold scaling comes after you have 1-2 case studies.

---

## 7. The one-sentence strategy

> **Get 1 paying founding customer from your warm network in 4 weeks** (highest-odds path), turn them into a case study + referral source, THEN scale the cold channel that tested best. Everything above is how to make that measurable.

Live tools: `/#/sell` (send this), `/#/takeaway` (price 1-pager), PPTX deck,
`10-OUTREACH-DRAFTS` (messages), `/#/mission` (track it all).
