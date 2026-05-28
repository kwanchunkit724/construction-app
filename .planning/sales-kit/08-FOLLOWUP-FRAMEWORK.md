# 08 — Follow-up Framework

## Timeline after first contact

```
Day 0: Cold DM sent / event business card exchanged
Day 1: Second DM if no reply
Day 3: Loom video send (60 sec demo)
Day 7: Skip — go silent. Don't be annoying.
Day 10: Last touch with hard question ("yes/no/maybe")
Day 14: Move to "dormant", revisit in 60 days
```

## After demo

```
Day 0 demo: Demo done. Verbal interest noted.
Day 0 evening: Send recap email (Script 9 in 03)
Day 1: WhatsApp thank-you note + Loom recording link
Day 3: Send 1-page PDF summary
Day 5: Schedule check-in call (15 min)
Day 7: Send pilot agreement template if they showed real interest
Day 10: If signed → onboarding. If silent → 1 last DM "still interested?"
Day 14: Move to "lost" or "long-term nurture"
```

## CRM — minimum viable

Use Google Sheets or Notion. Pipeline columns:

| Column | What goes in |
|---|---|
| **Firm** | Company name |
| **Decision maker** | Name + title |
| **Email** | Best email |
| **WhatsApp** | Phone with country code |
| **LinkedIn** | URL |
| **Tier** | T1 / T2 / T3 / T4 |
| **Source** | Where you found them |
| **First contact** | Date |
| **Last touch** | Date |
| **Next action** | What you owe them |
| **Stage** | Cold / Reached / Demoed / Piloting / Paying / Lost / Dormant |
| **Notes** | Anything specific they said — pain quotes, family info, project they mentioned |
| **Value (HK$)** | Estimated annual subscription value if they convert |

Update after every touch.

## Stage definitions

| Stage | Definition | Probability of close |
|---|---|---|
| **Cold** | You found them. No contact. | 0% |
| **Reached** | DM/email sent. Not replied. | 5% |
| **Connected** | Replied at least once. | 15% |
| **Demoed** | Saw demo. | 35% |
| **Pilot agreed** | Signed pilot. | 75% |
| **Pilot active** | First week of pilot. | 85% |
| **Paying** | Signed Standard / Pro. | 100% |
| **Lost** | Explicit no OR 30 days silence. | 0% |
| **Dormant** | "Not now, ask in 6 months." | 10% |

## Nurture — for lost / dormant

Don't ghost them. Once a quarter:
- Q1: Industry insight email (1 paragraph, 1 link to your blog post)
- Q2: New feature launch announcement (1 screenshot, 1 sentence)
- Q3: Case study email (1 success story, 1 line invite to chat)
- Q4: Year-end "happy 新年" + ask if anything changed

After 1 year of dormant + 4 nurture emails → archive. Stop touching.

## Onboarding (after they sign pilot)

### Day 0 (signing day)
- Send service agreement signed by both → PDF copy
- Create accounts via Supabase admin OR ask them for emails to register them
- Send credentials via WhatsApp (not email — phishing concerns)
- Schedule kickoff call 24-48 hours later

### Day 1-2 (kickoff call, 30 min)
1. Confirm they downloaded app, can login
2. Show them how to:
   - Create first project
   - Add zones (1座 / 2座 etc.)
   - Invite team via 加入 email list
   - Setup approval chain (PM + safety_officer for PTW)
3. Pick 1 ongoing site as pilot
4. Give them WhatsApp number for support
5. Schedule Day 14 mid-pilot check-in

### Day 3-13 (silent observation)
- Watch usage data daily (Supabase analytics)
- If 0 logins in 3 days → reach out: "Everything OK? Any issue I can help with?"
- If active → don't interrupt; let them use it

### Day 14 (mid-pilot check-in, 15 min)
- "What's working? What's broken?"
- Note feature requests, don't promise build
- Ask for one specific story: "Last week, did this app save you any time?"
- Plant the seed: "Pilot ends Day 30. We'll have option to continue at Standard tier."

### Day 28 (pre-end nudge)
- WhatsApp: "Pilot ending 2 days. Free 30 min review call Friday? I want your honest feedback."

### Day 30 (review call, 30 min)
- Listen first. What worked. What didn't.
- Then ask: "Continue? If yes, I send Standard agreement today, lock founding customer pricing."
- If yes → contract signed within 7 days OR account deactivates.
- If no → ask why, take notes, deactivate account, export their data.
- Either way → ask for referral.

## Anti-patterns (don't do these)

- ❌ Send weekly "checking in" emails with no value → annoying, marks you spammer
- ❌ Auto-drip campaign without personalization → looks like marketing automation
- ❌ Two follow-ups same day → desperate
- ❌ Push pilot extension beyond 30 days repeatedly → they're never converting
- ❌ Discount stack (pilot free + 50% off + extra month) → trains them to expect more

## Patterns that work

- ✅ One specific, value-add message per touch (not just "checking in")
- ✅ Reference something they said in last call ("you mentioned X — saw this article relevant")
- ✅ Quick wins they can use immediately (a tip, a template, a workflow)
- ✅ Public credit on social if they let you ("案例:[firm] reduced..."—with permission)
- ✅ Personal touches — congratulate them on a new project win

## Email subject line examples

Good:
- "CK工程 demo recap — 3 questions for next steps"
- "[Firm name] — pilot agreement attached"
- "[Their pain point you discussed] — 2 min answer"

Bad:
- "Following up" (vague)
- "Just checking in" (no value)
- "Quick question" (clickbait, then no quick question)

## WhatsApp message rhythm

- After first call: 1 message. Thank you + Loom link.
- Next day: 1 message. PDF summary.
- 3 days later: 1 message. Ask one specific question about their reaction.
- After that: only message when there's new info OR they respond.

**Rule of 3**: 3 messages without reply = stop messaging. Email instead.

## Closing — final 5%

When pilot is nearing end and customer is on the fence:
- Don't give one more feature. Don't drop price by 10%.
- Instead: send them a 2-min Loom of them USING the app (from your perspective) showing one specific time-save they got.

This works because it's not a sales pitch — it's their own evidence.

> 「Hi 陳生, I scrubbed the data this morning — you submitted 14 dailies via app over the pilot. 個個都係 30 秒內. WhatsApp 同 paper diary 嘅 same 14 dailies, sources say takes 4-6 mins each. You save ~75 min/week. Look forward to Friday review.」

## Tracking what's working

Weekly review (30 min, Sunday evening):
- How many new cold contacts this week?
- How many replies (and from what source)?
- How many demos booked?
- What objections kept coming up? — feed back to pitch refinement
- 1 thing to try differently next week
