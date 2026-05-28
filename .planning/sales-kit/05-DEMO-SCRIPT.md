# 05 — Live Demo Script (20 min)

> **The demo IS the sale.** They've seen your slides. Now they need to see real workflow on real phone. Do it once perfectly, get the order.

## Setup before demo

### Hardware
- iPhone with v1.1 from TestFlight (use 60001005 何判頭 account pre-logged-in)
- iPad showing PM view (60001001 李 PM pre-logged-in)
- Laptop with Chrome showing admin view (60001001 PM also OK on web)
- Charger for everything
- Screen mirror tool (e.g. ApowerMirror, free) to project iPhone to laptop → Zoom share screen

### Data state
- Reset DC2026 油塘 project to clean state before each demo
  - Run via Supabase: `select reset_persona_sim_data()` (if you build that helper; otherwise manually clean materials/dailies created during last demo)
- Keep:
  - 4 zones (1座-4座)
  - 22 progress items with assignees
  - 1 逾期 material (水管 100mm 逾期)
  - 1 event (政府結構檢查 後日 10am)
  - 3 contacts (陳師傅 電工 / 張師傅 水喉 / 李師傅 棚架)

### Pre-demo checklist (5 min before client joins)
- [ ] Phone battery > 80%
- [ ] iPhone in landscape lock OFF, brightness 100%
- [ ] Zoom share laptop screen — test screen mirror works
- [ ] Open app once and lock — ensures sessionStorage tab not flushed
- [ ] Close all other apps to avoid notifications
- [ ] Have backup video ready: `.planning/sales-kit/demo-backup.mp4` (record once)
- [ ] Glass of water nearby

---

## Demo Flow (20 min total)

### 0:00-1:00 — Set the stage

> "Before I open the app, one question — when your foreman 9am 起身打開電話，佢哋而家點 update 你個 PM 知道地盤情況?"

(They will answer: WhatsApp / phone call / 等到夜晚 reconciliation)

> "OK so let me show you what same workflow looks like with CK工程. Same foreman, same site, just different tool."

---

### 1:00-3:00 — Foreman / 判頭 view (mobile-first)

**Login as 何判頭 (60001005) on iPhone, screen mirrored**

Show in order:
1. Home page — "佢開 app 即見今日要做嘅 site (DC2026 油塘)"
2. Tap project → progress tree
3. **Point out**: only 2 items visible (水管立管 1座 + 3座). 「佢只見自己嘅 work，唔會見其他人嘅。Privacy + focus.」
4. Tap leaf item → show 需用物料 panel automatically below
5. Show 水管 100mm 逾期 (red chip)
   > "見到呢個紅色嘅逾期 chip 嗎？呢個物料原本 5/26 應該到貨，已經 overdue。判頭一打開呢個 item 即刻知，唔需要等 office message 佢。"
6. Tap 更新 → progress slider with 25/50/75/100 chips
   > "Foreman 戴住手套，揾 4 個 chip 直接 tap. 唔使瞄住個細嘅 slider."
7. Save → realtime push to PM
8. Show 物料 tab → 加物料 →
   - Name: 焊條
   - 5 包 / urgent ON (red toggle)
   - Planned: now + 4 hours
   - Picker shows only 判頭's items (RBAC scoping)
   - Submit → sees 焊條 at top with 急件 red chip

> "成個 flow 30 秒. Foreman 唔需要再喺 WhatsApp 上 type 「老總 麻煩急件 5 包焊條」然後等老總 scroll 4 個 group 揾返條 message."

---

### 3:00-5:00 — Daily log workflow

> "Daily report 係 office 一直最痛嘅地方. 等到 5pm 都收唔齊."

1. Switch to 黃管工 foreman (60001004) on iPad (he writes daily, judou doesn't)
2. Tap 每日日誌 → 填寫今日日誌
3. Pick 天氣 = 大風 (chip-based, 2 taps)
4. Tick 2 completed items — point out [1座] zone chip on each
   > "你睇呢個 [1座] chip — 4 個 zone 都有 02-01 號 item，但 chip 即刻區分得到. WhatsApp 上係冇呢個 context."
5. Add 自由項目: 「外牆架已搭好」
6. Scroll to bottom — 儲存 button NOT overlapping BottomNav (fixed in v1.1)
7. Tap 儲存 → returns to list with entry
8. **Switch back to PM (60001001) on laptop**
9. Open same 每日日誌 → see 黃管工's entry within 1 second (realtime via Supabase channel)

> "From foreman tap 儲存 到 office PM 見到 — 1 秒. 唔需要等 daily compile, 唔需要再 copy-paste."

---

### 5:00-7:00 — PM / 老總 supervisor view

**On laptop (60001001 李 PM):**

1. Open DC2026 油塘 project
2. Show progress tree — full 4 zones, 22 items visible
3. Show 加大項 button + 加細項 / 指派 / 歷史 buttons (supervisor controls)
4. Click 行事曆 →
   - 物料 entries with planned arrival
   - 完工 entries with [N座] prefix
   - Manual events (政府結構檢查 後日 10am)
5. Open 統計卡: 0 完成 / 2 進行中 / 0 落後 / 19 未開始

> "PM real-time 睇晒成個 project 4 個 zone. 完全唔需要等 foreman daily, 唔需要等 weekly meeting."

---

### 7:00-9:00 — 老總 add event + multi-zone peer apply

1. Switch to 王老總 (60001002) on iPad
2. Show same 4 zone visibility (general_foreman = supervisor tier same as PM)
3. 行事曆 → 加事件:
   - Title: 結構檢查 demo
   - Starts: 後日 10:00
   - Location: 1座
   - Save → push notification fires to all approved project members
4. Switch back to 何判頭 on iPhone → show notification banner
   > "Realtime — 老總 add event, 判頭 即收 push."

5. **Multi-zone peer apply** demo:
   - 老總 → 3座 → 加大項
   - Title: 「臨時工程 demo」
   - Code: auto-assigned
   - Check 「同時 apply 去其他 zone」 → tick 1座 / 2座 / 4座
   - Submit → 4 rows created (one per zone)
   - Open each zone tab → see same 大項 in all 4

> "一個動作，4 個 zone 同步建. 唔使 copy paste 4 次. 唔使擔心 typo. WhatsApp 點 do 呢個？做唔到."

---

### 9:00-11:00 — Materials picker with RBAC + 急件 list

**On iPhone, switch back to 何判頭**

1. 物料 list — show all visible items + 急件 sort to top
2. **For materials NOT owned by 判頭** (e.g. 鋼筋 by 黃管工):
   - 入貨 / 編輯 / 刪除 buttons are HIDDEN
   - "RBAC per-row gate. 判頭睇得到，但只能改自己 order 嘅嘢。"
3. **For materials owned by 判頭** (e.g. 接駁管):
   - 入貨 / 編輯 / 刪除 buttons VISIBLE
4. Click 加物料 → picker only shows 判頭's items (RBAC scoping)

> "Security and trust built-in. 判頭 唔會誤改其他人物料 — RLS at DB level blocks it, plus UI hides buttons. 兩層保護."

---

### 11:00-13:00 — 指派 + multi-tab tab bleed fix

**On laptop browser, login as PM:**

1. Tap leaf item → 指派 → modal shows candidates:
   - 工程師 / 管工: 陳工程師, 黃管工 (main_contractor)
   - 判頭 candidates: 何判頭 (subcontractor)
   - **Crucially**: list is NOT empty (was empty in pre-v21 builds, v21 RLS fix surfaces project peers)
2. Pick 何判頭 → save
3. **Open second tab** → login as 何判頭 → switch back to PM tab
4. PM tab still shows PM (does NOT flip to 判頭 — per-tab UUID storageKey fix)

> "Old version, two tabs → PM flips to 判頭 mid-edit. Now per-tab session isolation. Office can run multiple tabs safely."

---

### 13:00-15:00 — Export + audit trail

1. Top-right export button → PDF (Chinese-supported via html2canvas)
2. PDF shows: progress tree by zone, completion status, assigned-to
3. Excel export → progress items as outline tree (collapse/expand)

> "Owner asks for status report — 1 click. Audit dispute happens — every item has last-updated-by + timestamp. Defensible."

---

### 15:00-17:00 — Account deletion + Apple compliance

> "One thing we did extra for Apple compliance — 帳號刪除. 你員工辭職，老總要 wipe 佢嘅 access + data. Press one button."

1. Show 個人 settings → 刪除帳號 → confirm dialog → done
2. Data: dailies / progress assignments / materials — 17 FKs SET NULL on delete (v20 migration)
3. Account row in auth.users + user_profiles → gone
4. Apple App Store deletion review passed.

---

### 17:00-19:00 — Q&A from them

Common questions ready answers:

- "Cost?" → Pull out Slide 9 (pricing table). Anchor at 3,800/月 per project. Pilot first month free.
- "What about offline?" → "We use Capacitor wrapping a React app, so PWA-style. Limited offline today — adding full offline next quarter."
- "Custom report?" → "Pro tier. Or you tell me what you need, I add it within 2 weeks."
- "Integration with Cubicost/SAP?" → "Q4 roadmap. We open API endpoints already."
- "How is data stored?" → "Supabase managed Postgres in Singapore region. PDPO compliant."
- "If we leave, do we get data?" → "Yes. PDF + Excel + JSON export on demand or on account close."

---

### 19:00-20:00 — Close ask

Pick ONE:

**Option A — Pilot ask (most common)**:
> "Let's run 1 month pilot — DC2026 oil gold 油塘 or whichever your next site. 10 users, 1 zone or 4 zone, your choice. $0. Friday I send service agreement, Monday next week we onboard. Sound right?"

**Option B — Sign now ask (if they're enthusiastic)**:
> "If you sign today, I lock founding-customer pricing at HK$2,800/月 (vs standard 3,800) for 12 months. Same all features. We can sign electronically on phone now."

**Option C — Follow up scheduled (if they're cautious)**:
> "I'll send the recap email today with link to download iOS or Android. Try it yourself this weekend. Next Tuesday 2pm, can I call you for 15 min to hear feedback?"

---

## After demo (next 24 hours)

1. Send recap email (Script 9 in 03-OUTREACH-SCRIPTS.md) with:
   - 1-page PDF takeaway
   - Loom recording of the demo (record yourself doing it)
   - Pilot agreement draft
   - Calendar link for follow-up
2. WhatsApp them a 30-sec thank-you note
3. Update target spreadsheet — stage: "Demoed" → "Pilot agreed" / "Follow up" / "No-go"
4. If "Pilot agreed" → start onboarding (Day 1 task: setup account, give credentials, schedule training call)

## What can go wrong + recovery

| Problem | Recovery |
|---|---|
| WiFi dies during demo | Switch to pre-recorded video. "Same workflow, let me play the video while I reconnect." |
| Login fails on iPhone | Already logged in (you did pre-demo). If session expired, switch to iPad backup. |
| Realtime push doesn't fire | "Show that on screenshots — sometimes Supabase Realtime takes 3-5 sec." |
| They ask deeper technical Q | "Great question — let me note it down [write in notebook visibly] and email you a precise answer within 48 hours." Don't bullshit. |
| They ask "show me how 棚架 PTW works" | Pull up safety_officer login on web. If you didn't seed, "I can record a separate video and send tomorrow." |

## Demo confidence boosters

Before each demo:
- Read Slide 6 + this whole file
- Do a 5-min dry run alone
- Refresh DC2026 油塘 data (clean state)
- Battery + WiFi check
- Breathe. They're as nervous as you about how it'll go.

The best demos feel like a conversation, not a presentation. **Pause every 30 seconds and let them comment.** Their reactions tell you which features matter to THEM.
