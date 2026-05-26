# Persona Simulation Report — DC2026 油塘住宅 Week 22

Date: 2026-05-26
Personas run (parallel agents): 王老總 / 陳工程師 / 黃管工 / PM / 何判頭
Tag: `[persona-sim-DC2026]`

---

## Setup recap

- Project: DC2026 油塘住宅, 4 zones (1/2/3/4 座), week 22, 主體 80% / 二次 30%
- Seeded: 22 progress items, 3 materials (1 intentionally 逾期), 1 event, 3 contacts, 2 yesterday dailies
- Accounts: 5 phone numbers, password `test1234`, one per role
- All 5 agents drove live Vercel preview via Chrome MCP, isolated tabs, individual auth sessions

---

## Per-persona summary

### 王老總 (general_foreman) — supervisor tier
- ✅ Saw all 4 zones, ancestor + descendant tree
- ✅ Peer-zone child add worked (added 細項 across 1/2/3/4 座 in single action)
- ✅ Multi-zone 大項 add propagated correctly
- ⚠️ Re-assign foreman→判頭 button hidden until item expanded — 2 extra taps
- ⚠️ Contact add succeeded but no toast confirmation (uncertainty)
- ⚠️ Login pre-fill `91234567 / admin1234` visible on prod-like build
- Retro: "睇到曬，但 reassign 流程要兩步太多，加個 swipe action 直接調人"

### 陳工程師 (engineer, main_contractor) — restricted
- ✅ Visibility narrowed correctly — only own items + ancestor chain
- ✅ 大項 add button hidden (correct gate)
- ✅ Daily form item picker scoped via RPC — only 2 leaf items visible
- 🐛 Yesterday daily edit blocked but error toast empty ("" string)
- 🐛 Daily 完工 entries on calendar show item code not 「項目名 — 座」 → confusion across zones
- ⚠️ Material request form has no "急件" toggle — note field abused
- Retro: "可以交，但日曆唔知邊個座係邊個 item，office 問返我"

### 黃管工 (foreman, main_contractor) — restricted + mobile
- ✅ Daily submit 12 taps, 38 秒, single-finger ok
- 🐛 **P0**: 儲存 button overlap 底部 BottomNav — last 8px tap dead zone
- 🐛 **P0**: Material request 物料 picker leaks ALL project items, not assigned-only — security/UX leak
- ✅ Contact add blocked correctly
- ✅ 大項 button hidden
- ⚠️ "更新" 進度 slider tap target 36px (<44px Apple HIG)
- ⚠️ touch targets under sun glare borderline (foreman wore gloves in test)
- Retro: "慳到時間，但個儲存掣俾我撳到 bottom nav，搞咗 3 次先入到"

### PM — supervisor tier
- ✅ All structural actions worked (大項/細項 add, delete, reassign)
- ✅ Peer-apply across 2/3/4 座 in 1 modal
- 🐛 Cross-tab auth bleed: opened PM session in tab A then 判頭 session in tab B → tab A profile flipped to 判頭. Supabase BroadcastChannel + localStorage shared token.
- ⚠️ Bulk assign UX: only one assignee at a time, no multi-select picker
- ⚠️ 政府結構檢查 event added but no auto-notification to assigned trades
- Retro: "Functional 完整，但 tab bleed 係 blocker — office 用兩個 tab 好正常"

### 何判頭 (subcontractor) — restricted + read-mostly
- ✅ Saw only own 2 items (水管立管 1/3 座)
- ✅ Daily blocked by sub_role — correct
- 🚨 **SECURITY P0**: Materials UPDATE RLS too permissive — successfully `PATCH /materials/<other-user-id>` to rename 黃管工 焊條 → `焊條 [HACKED]` AND marked 鋼筋 fully arrived. HTTP 200. DELETE policy correct, UPDATE policy missing owner check.
- 🐛 **P0 dead code**: `MaterialItemsPanel.tsx` exists with docstring "Mounted inside ProgressItemCard" but never imported. Scenario step 5 (open item → see 需用物料 panel) renders nothing.
- 🐛 Daily list silently hides "新增" for 判頭 with no role hint — sub_role gate exists in `DailyList.tsx:38-41` but UX dead-end
- 🐛 Materials list: 刪除/編輯/入貨 buttons always visible — no per-row owner gate
- ⚠️ 逾期 chip on 水管 100mm showed correctly (client-side date diff working)
- ⚠️ Login pre-fill 91234567/admin1234 — same as 老總/engineer
- Retro: "7/10 yes. Better than WhatsApp + paper. But 我會叫朋友 keep 一份 WhatsApp log until materials accountability 鎖好"

---

## Cross-persona findings

### Security (must-fix before next TestFlight)
| # | Severity | Issue | Hit by | Fix location |
|---|---|---|---|---|
| S1 | 🚨 CRITICAL | `materials` UPDATE RLS allows ANY project member to mutate ANY material row (verified via direct REST PATCH) | 判頭 | New migration `supabase/v16-materials-rls-fix.sql` — add `requested_by = auth.uid() OR is_supervisor()` to UPDATE policy |
| S2 | 🚨 CRITICAL | Cross-tab auth bleed — Supabase BroadcastChannel + shared localStorage token flips active profile across tabs | PM, 老總, 判頭, engineer (4/5) | `src/lib/supabase.ts` — disable broadcast OR `src/contexts/AuthContext.tsx` — detect `SIGNED_IN` cross-tab event + reload |
| S3 | ⚠️ HIGH | Login form pre-fills dev credentials `91234567/admin1234` on prod-like build | 老總, engineer, 判頭 (3/5) | `src/pages/Login.tsx` — gate prefill behind `import.meta.env.DEV` |

### Dead code / missing wiring
| # | Issue | Fix |
|---|---|---|
| D1 | `MaterialItemsPanel.tsx` never imported into `ProgressItemCard.tsx` — "需用物料" panel does not render in item card | Import + mount inside leaf branch of `ProgressItemCard` |

### RBAC consistency gaps
| # | Issue | Hit by | Fix |
|---|---|---|---|
| R1 | Daily form material picker leaks ALL project items to restricted roles (should mirror `get_visible_progress_items` RPC) | foreman | `DailyEdit.tsx` material panel — switch from raw query to RPC |
| R2 | Materials list 刪除/編輯/入貨 buttons rendered for all users — only owner/supervisor should see | 判頭 | `MaterialList.tsx` — per-row `canMutate` gate |
| R3 | DailyList "新增" hidden silently for sub_role-blocked users (判頭/owner/worker) — no UX explanation | 判頭 | `DailyList.tsx:38-41` — show grey banner "你嘅角色唔可以寫 daily" |

### UX friction
| # | Issue | Hit by | Fix |
|---|---|---|---|
| U1 | 儲存 button overlaps BottomNav on phone — last 8px dead zone | foreman | `DailyEdit.tsx` — add `pb-20` to form or sticky bottom bar above nav |
| U2 | 進度 update slider tap target 36px (<44px HIG) | foreman | `ProgressUpdateModal` — bump slider thumb size |
| U3 | Item labels show only code, no zone prefix — confusing across 4 zones | engineer, 老總, foreman | `ProgressItemCard`, `Calendar`, daily picker — render `[1座] 批盪 1/F` |
| U4 | Re-assign requires expanding item first — 2 extra taps for supervisor flow | 老總 | Surface 指派 button in collapsed row |
| U5 | No multi-select assignee picker — must reassign one at a time | PM | `AssigneePicker` — multi-select mode |
| U6 | Event creation does not auto-notify assigned trades | PM | DB trigger `events_insert_notify` |
| U7 | Daily edit yesterday locked but empty toast on attempt | engineer | `DailyEdit.tsx` — show "尋日日誌已鎖" message |
| U8 | Calendar 完工 entries lack zone prefix | engineer | `Calendar.tsx` — append zone to event title |

### System wins (working as designed — keep)
- ✅ Visibility RPC `get_visible_progress_items` correctly narrowed restricted roles
- ✅ Peer-zone child add (the original feature D request) works end-to-end across all 4 zones
- ✅ general_foreman supervisor tier confirmed (full tree visibility, can manage structure)
- ✅ Restricted sub_roles (foreman/engineer) cannot add 大項 — button hidden correctly
- ✅ 判頭 cannot write daily — sub_role gate enforced
- ✅ 逾期 material chip computes correctly client-side
- ✅ Yesterday daily lock enforced (HKT date-bound RLS)

---

## Suggested next iteration — P0 punch list

1. **`supabase/v16-materials-rls-fix.sql`** — tighten UPDATE policy to owner OR supervisor
2. **`src/contexts/AuthContext.tsx`** — handle cross-tab `SIGNED_IN` event, reload on profile mismatch
3. **`src/pages/Login.tsx`** — gate dev pre-fill behind `import.meta.env.DEV`
4. **`src/components/ProgressItemCard.tsx`** — import + mount `MaterialItemsPanel` for leaf items
5. **`src/pages/DailyEdit.tsx`** — material picker uses visibility RPC; add `pb-20` to form
6. **`src/components/MaterialList.tsx`** — per-row owner/supervisor gate on mutate buttons
7. **Zone-prefix labels** across `ProgressItemCard` / `Calendar` / daily picker

---

## Recap (caveman zh-HK)

5 persona跑完。最大兩個火頭：

1. **物料 RLS 漏洞** — 判頭可改人哋物料，HTTP 200 直接PATCH。要 patch UPDATE policy 加 owner check。係 security blocker，唔可以等。
2. **Tab bleed** — PM 開兩個 tab 一個變判頭。Supabase localStorage 共享 token。office workflow 一定爆。

Plus：foreman 撳唔到儲存掣 (overlap nav)，物料 picker 露曬全 project items，登入 form 預填 dev 密碼。

要唔要我開 phase 去 spec 呢兩個 fix? Materials RLS 一個 migration 搞掂，tab bleed 要諗 auth strategy。
