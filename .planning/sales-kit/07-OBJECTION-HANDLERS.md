# 07 — Objection Handlers

> Every "no" has a reason. Ask "why" before answering. Most objections are smokescreens — find the real one underneath.

## Top 12 Objections (zh-HK + English)

---

### 1. "我哋已經用 WhatsApp 用得好順" / "WhatsApp works fine for us"

**Real concern**: Change aversion. They don't want to retrain staff.

**Response**:
> 「WhatsApp 短期內好快，長期係 dispute 嘅 source. 一個問題：上一次有人 ask 你「6 月 13 號 焊條 邊個簽 received」，你要 scroll 幾耐? 我 demo 過嘅 client，每月平均 90 分鐘喺 scroll WhatsApp 揾 record. 我哋 30 秒搜.」
>
> 「Pilot 一個月 $0. 揾你嘅 small project 試. 唔順用就 cancel, 完全冇 lock-in.」

---

### 2. "成本太貴" / "Too expensive"

**Real concern**: Either really tight budget OR doesn't trust ROI yet.

**Response**:
> 「3,800 一個月. 我問你：你 PM 每月 wage 幾錢? 假設 50,000. 我哋 save 佢每日 1-2 小時 chasing daily, 即係 22 工作日 × 1.5 小時 × HK$250/hr = HK$8,250/月 productivity. 仲未計 dispute cost.」
>
> 「Pilot 1 個月 $0. 你親手用一次，計返你嘅實際 ROI，再決定值唔值.」

**If they push harder**:
> 「Founding customer discount: 2,850/月 for 12 months 如果你 sign before [date]. Lock in 一年 price.」

---

### 3. "我哋已經有 Cubicost / Glodon / 用緊另一個 software"

**Real concern**: Worry about software duplication / integration mess.

**Response**:
> 「Cubicost / Glodon 係 QS 軟件. 做 bill of quantities, costing, 出 quotation. 好嘢, 我哋唔做.」
>
> 「我哋專做 daily ops — foreman 30 秒交 daily, PTW 電子簽, 物料 alert. 即係 你而家用 WhatsApp + paper diary 做嘅 stuff.」
>
> 「我哋同 Cubicost 唔衝突, 填咗你 office-to-site 嘅 gap.」

---

### 4. "我老闆 / 老總 唔肯試新嘢" / "My boss doesn't try new things"

**Real concern**: You're talking to a champion, not decision maker. They want ammo to convince upstairs.

**Response**:
> 「明白. 老總睇實際 results. 等我 offer 一個: 我 send 一個 5 分鐘 case study video + 1 頁 ROI math 你 print 出嚟. 你下次 weekly meeting 用 5 分鐘介紹. 我同你準備好 talking points.」
>
> 「如果老總有興趣再 schedule 一個 15 分鐘 demo, 我直接 explain 俾佢聽.」

---

### 5. "如果你哋執笠 / shutdown 點算?" / "What if your company shuts down?"

**Real concern**: Vendor risk. Legitimate.

**Response**:
> 「Fair question. 3 protections:
>
> 1. **Data export anytime** — PDF + Excel + JSON. Even on Pilot, you can export 30 秒.
> 2. **Open source backend (Supabase)** — Postgres data. Industry standard. If we go away, your IT team can migrate to other tools.
> 3. **Source code escrow** — Pro tier 客戶, 我可以 deposit code with HK escrow service. 如果我哋 cease operations, you get full code access.」

---

### 6. "你做緊 backend, 安全唔安全?" / "Is the data secure?"

**Real concern**: Real question, especially for property developer pilot.

**Response**:
> 「3 layers:
>
> 1. **Apple App Store + Google Play** review passed — both stores audit security baseline.
> 2. **Supabase managed Postgres** — encryption at rest + TLS in transit.
> 3. **RLS policies** — 5-persona simulation, 25 attack vectors all blocked. Subcontractor 唔可以改其他人 material, 唔可以升級自己做 admin, 唔可以睇其他公司 project. 全部 enforced at DB level.」
>
> 「我有一份 security audit summary 我可以 send 你.」

---

### 7. "你能唔能 integrate with 我哋嘅 SAP / Oracle / 自家 ERP?"

**Real concern**: Tier 3 enterprise concern. Don't lose them; defer.

**Response**:
> 「Today 我哋 expose REST endpoints (Supabase Postgres API). 你 IT 可以 read 我哋 data + push back.」
>
> 「Customer-specific 雙向 integration roadmap Q1 2027. If you're our anchor customer on Pro tier, we'll prioritize building your specific integration in scope.」

---

### 8. "我哋係政府工程 / Government work — 需要特別 compliance"

**Real concern**: They tender HK Government, need data on HK soil + specific certifications.

**Response**:
> 「Government tender: aim for v2.0. 唔好 promise 嘅嘢: PAS 91, BSi ISO 27001, MTRC IT Security clearance — we don't have yet.」
>
> 「If you have a private-sector project mainly serving private developers, fully fine to start.」

---

### 9. "Foreman 唔識 / 唔肯用 mobile app"

**Real concern**: Adoption fear. Common.

**Response**:
> 「3 角度:
>
> 1. **Demo 過嘅 foreman aged 55+ 都用得到** — 4 個 chip + 一個 slider. 真係比 WhatsApp 簡單.
> 2. **判頭 / worker tier 唔需要寫 daily**. 只 foreman + engineer 寫. RBAC blocks 判頭 from daily.
> 3. **Onboarding session** included in Pro tier — 我親身去你 site 教 4 個 foreman + 1 PM 30 分鐘. Standard tier 可以 WhatsApp video walkthrough.」
>
> 「Pilot 一個月後, foreman 自己 vote — 鍾意 keep 用, 唔鍾意停. 你話晒事.」

---

### 10. "我哋一年內就會 IPO / acquired, 唔想 commit"

**Real concern**: Either smokescreen OR real corporate event.

**Response**:
> 「Pilot $0 一個月. 跟住 month-to-month subscription. Cancellation 30 天 notice. 不 lock-in.」
>
> 「If IPO / acquisition happens, you take the data with you anytime.」

---

### 11. "你 demo 嘅 看起來太好 — 太完美" / "Demo looks too good"

**Real concern**: They smell sales pitch. Be honest.

**Response**:
> 「Fair. 真實 limitations:
>
> 1. **Offline mode** 而家係 limited. WiFi 不足 嘅 site partial work, 接返 WiFi sync. Full offline 6 月後 ship.
> 2. **棚架 / 焊接 specific PTW** — 我哋 generic PTW template OK 但專業 form 仲未 ship. Q3 roadmap.
> 3. **iPad large-screen 用 desktop layout** — touch experience 唔特別 optimized. Working on it.
>
> 「Pilot 一個月你親手測, 揾到 deal-breaker 就 cancel. Honest.」

---

### 12. "我下個月先傾啦 / Let me think about it / I'll get back to you"

**Real concern**: 90% chance this is no. Need to extract real reason.

**Response**:
> 「明白. 一個 question — 而家 holding back 嘅係:
>
> a) **Pricing**? 我可以 explore other tier.
> b) **Feature gap**? 你話 邊 一個 feature 需要 ship 你先 buy.
> c) **Trust**? 我可以 send security audit / case study video.
> d) **Timing**? 你哋下個 project start date 邊度? 我哋對 timing.
>
> 「如果係 d) timing, 我 schedule 下次接觸. 其他三個我 today 解決到.」

---

## Hard Objections (sometimes you just lose)

These are red flags — accept and walk away gracefully:

- "We're committed to building in-house" → "Sounds great. Connect if your team ever wants benchmarking."
- "We don't use cloud — too risky" → "Self-hosted available Q4 2026. Reach back."
- "Owner uses Excel, no changing" → "Understood. Send WhatsApp anytime."

Never:
- Beg
- Lower price 50%+
- Talk negatively about competitors
- Bullshit security

Walk away with relationship intact. They might come back in 6 months. Or refer someone else.

---

## When they say YES — don't oversell

Common mistake: client says "OK let's pilot" → seller keeps pitching new features → client gets confused → second thoughts.

**When you get YES, shut up and write the agreement**.

> 「太好喇. 我 today send pilot agreement, you sign tomorrow, Monday next week 我 setup account + give credentials. 我 WhatsApp 你 onboarding video.」

---

## Power phrases that work

- "Fair question, here's the honest answer..."
- "Pilot 一個月 $0. Try yourself."
- "I'll send the recap email today. Your team can review at their pace."
- "Your decision, no pressure."
- "What would change your mind?"
- "Tell me about the last dispute you had..."

## Power phrases that DON'T work

- "Trust me, it works"
- "Everyone in HK construction is moving to this"
- "Last chance for founding customer pricing" (false urgency = lose trust)
- "Our competitor X is terrible because..."
