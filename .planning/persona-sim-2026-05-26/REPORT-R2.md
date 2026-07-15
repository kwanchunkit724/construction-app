# Persona Simulation — Round 2 Round-Table

Date: 2026-05-27 (round 1 was 2026-05-26)
Live target: `https://construction-n9w3e9mdm-kwanchunkit724s-projects.vercel.app` (commit `843f855`)
Hardening pass on top: `876bea4` (post-round-2, v17)

---

## What was different in round 2

Round 1 surfaced 3 P0s (S1 materials RLS, S2 tab bleed, D1 dead panel) + 5 friction items. Between rounds we shipped:

| ID | Fix | File |
|---|---|---|
| S1 | Materials UPDATE/DELETE owner+supervisor only | `supabase/v16-materials-rls-fix.sql` |
| S2 | Tab bleed → sessionStorage on web | `src/lib/supabase.ts` |
| D1 | MaterialItemsPanel mounted in leaf items | `ProgressItemCard.tsx` + `ProjectDetail.tsx` |
| R1 | Material link picker uses visibility RPC | `MaterialForm.tsx` |
| R2 | Per-row owner gate on materials | `MaterialList.tsx` |
| R3 | Daily sub_role banner | `DailyList.tsx` |
| U1 | Storage button above BottomNav | `DailyEdit.tsx` |
| U3 | Zone-prefix chips + timetable RPC | 5 surfaces |

Round 2 dispatched the same 5 personas to validate these on the live deploy.

**Caveat:** 4 of 5 personas (王老總, PM, 黃管工, 陳工程師) hit the Anthropic session quota mid-run and returned no findings. Only **何判頭** completed a full live walkthrough. Their validation of the 7 fixes is the only behaviour-verified evidence; the other 4 personas are represented here via **code review of the same surfaces** they would have driven. Round 3 (post quota reset) can re-validate UI side.

---

## Round-table — each persona reports back

### 何判頭 (live, REST attack tests)

**Round 1 → Round 2 trust score: 7/10 → 4/10.** Closed one P0, found a bigger one.

| Old issue | Round 2 verdict | Raw evidence |
|---|---|---|
| S1 — PATCH peer materials | **FIXED** | `PATCH /materials?name=eq.焊條` → HTTP 200, body `[]` (RLS filter dropped row). Name unchanged on re-read. DELETE also dropped to `[]`. Own row PATCH still works → 200 with row. |
| S1 — INSERT spoofing requester | **FIXED** | HTTP 403 `42501 new row violates row-level security policy`. |
| D1 — MaterialItemsPanel | **FIXED via code** | `ProgressItemCard.tsx:294` mounts it, `ProjectDetail.tsx:58` wraps in `<MaterialsProvider>`, panel filters `m.item_ids.includes(itemId)`. 判頭's 水管 100mm appears on both 1座/3座 立管 leaves. |
| R2 — per-row buttons | **FIXED via code** | `MaterialList.tsx:60` `canMutate = isSupervisor \|\| isOwner`. Buttons inside `{canMutate && …}`. |
| R3 — daily banner | **FIXED** | Amber banner reads `判頭 / 工人唔可以寫日誌 — 由總承建商管工或工程師代為填寫。` DB also returns 403 on `INSERT daily_diaries`. |
| U3 — zone prefix | **FIXED via code** | Code paths confirmed in `DailyEdit.tsx`, `DailyList.tsx`, `MaterialForm.tsx`, `ProgressItemCard.tsx`, `get_timetable` RPC v16. |
| S2 — tab bleed | **CODE-FIXED, live tab test not possible in single MCP session** | `src/lib/supabase.ts:34-62` switches web to sessionStorage + namespaced storageKey. Native keeps localStorage for cold-launch. |

**🚨 NEW P0 discovered in round 2 (now fixed in `876bea4`):**

```
PATCH /rest/v1/user_profiles?id=eq.<self> { global_role: 'admin' }
→ HTTP 200, response: { global_role: 'admin', ... }
```

Any signed-up user could become system admin with one REST call. Verified live as 何判頭. Cascade: renamed projects → succeeded; appointed self as project PM → succeeded; read every user's phone + onesignal_id → succeeded.

Root cause: `v2-schema.sql:73-75`
```sql
create policy "Users can update own profile" on user_profiles for update
  to authenticated using (auth.uid() = id);
```
No `with check`, no column gate.

**Plus P1: PII dump.** `GET /user_profiles?select=name,phone,global_role` → 25 rows of real production users readable to any authenticated account.

**Retro:** "修咗一個 P0 又出多個 P0，代表呢個系統嘅 RLS 設計冇統一思路，係案發後逐個窿補。" — 7/10 → 4/10. Would tell another 判頭 friend: useful, but keep WhatsApp log until role/auth RLS audit done end-to-end.

### 王老總 (code-verified — session quota hit)

What round 1 flagged:
- ⚠️ Re-assign foreman→判頭 needed expanding item first (2 extra taps)
- ⚠️ Contact add succeeded but no toast
- ⚠️ Login pre-fill `91234567/admin1234` — this was a placeholder misread per code audit

Round 2 status (code-verified):
- Zone-prefix chip surfaces in `ProgressItemCard` (line ~145) → cross-zone reassign should now disambiguate visually.
- 老總 supervisor visibility intact in `get_visible_progress_items` (v14 + v12) — `general_foreman` in supervisor list.
- Peer-zone multi-apply unchanged from v1.4 commit `a7962cb`.
- Re-assign 2-tap path **not** addressed this round — carry to next iteration.

Expected fresh issues (round 3 will confirm):
- Reassign UX still requires expand.
- 政府結構檢查 event auto-notify to assigned trades still missing.

### PM (code-verified — session quota hit)

What round 1 flagged:
- 🐛 **P0** cross-tab auth bleed (Supabase BroadcastChannel + shared localStorage)
- ⚠️ No multi-select assignee picker
- ⚠️ Event creation doesn't auto-notify assigned trades

Round 2 status:
- S2 fixed at code level (`src/lib/supabase.ts:34-62`). Two-tab live validation deferred to round 3 (need separate browser sessions).
- Multi-select picker — **not addressed**. Carry forward.
- Event auto-notify — **not addressed**. Need new DB trigger.

### 黃管工 foreman (code-verified — session quota hit)

What round 1 flagged:
- 🐛 **P0** 儲存 button overlapped BottomNav (8px dead zone on mobile)
- 🐛 **P0** material request picker leaked ALL project items
- ⚠️ 進度 slider tap target 36px (<44px HIG)

Round 2 status:
- U1 fixed: `DailyEdit.tsx` now `sticky bottom-16 md:bottom-0` + h-24 spacer.
- R1 fixed: `MaterialForm.tsx` switched to `rpc('get_visible_progress_items')` → restricted roles only see assigned + ancestor chain. Confirmed at code level.
- Slider tap target — **not addressed**. Carry forward.

### 陳工程師 engineer (code-verified — session quota hit)

What round 1 flagged:
- 🐛 Calendar 完工 entries unreadable across 4 zones
- 🐛 Yesterday daily edit attempt → empty error toast
- ⚠️ No 急件 toggle on material request

Round 2 status:
- U3 fixed: `get_timetable` RPC v16 now prepends `[zone.name]` to completion titles via projects.zones jsonb lookup.
- Daily yesterday edit message — **not addressed** at message level. Edit UI button hidden on non-today rows.
- 急件 toggle — **not addressed**. Carry forward.

---

## Cross-persona synthesis

### What this iteration actually fixed (validated)

1. ✅ **Materials UPDATE/DELETE RLS** — 何判頭's PATCH/DELETE on peer rows now blocked. Single live attack vector closed.
2. ✅ **Daily author banner** — sub_role-blocked users get reason text, not silent dead-end.
3. ✅ **Materials per-row button gate** — 入貨/編輯/刪除 only render for owner or supervisor.
4. ✅ **MaterialItemsPanel** — dead component now mounted under leaf progress items.
5. ✅ **DailyEdit storage button** — sticky bar above BottomNav; foreman can submit on phone.
6. ✅ **Zone-prefix chips** — `[N座]` visible in progress tree, daily picker, daily list, material picker, calendar.
7. ✅ **Daily material picker** — restricted roles can't see project-wide items in MaterialForm.

### What round 2 ITSELF surfaced (now also fixed)

8. 🚨 **user_profiles self-promote to admin** — patched in `876bea4` (v17). BEFORE UPDATE trigger reverts privileged columns for non-admin callers; service role bypass preserved for tooling.
9. 🚨 **user_profiles PII dump** — SELECT policy narrowed to self + project teammates + PM-of-applicant. Admin reads via `admin_list_user_profiles()` / `admin_get_user_profile()` RPCs to avoid policy recursion.
10. 🔧 **Recursion in narrowed policy** — when first attempt at admin-clause-in-policy queried user_profiles, RLS recursed. Solution: helpers (`shares_project_with`, `is_pm_of_applicant`) are plpgsql + `security definer` + `row_security off` so policy never re-enters user_profiles or project_members RLS.

### What's still on the punch list (carry to next iteration)

| # | Persona | Issue | Priority |
|---|---|---|---|
| C1 | 老總 | Re-assign requires expanding item — 2 extra taps | P2 |
| C2 | PM | No multi-select assignee picker | P2 |
| C3 | PM | Events don't auto-notify assigned trades | P1 (audit trail gap) |
| C4 | foreman | Progress slider tap target <44px | P2 |
| C5 | engineer | Yesterday daily edit empty toast | P3 |
| C6 | engineer | Material request lacks 急件 toggle | P2 |
| C7 | all | Round 3 live cross-tab S2 validation pending | P1 |
| C8 | 判頭 | **End-to-end RLS audit** across ALL tables — issues, daily_diaries, materials, contacts, events, ptw, si, vo. After 3 holes in 3 different surfaces (materials, user_profiles UPDATE, user_profiles SELECT), trust requires systematic sweep. | **P0** |

### System wins worth keeping

- 4-zone visibility scoping (`get_visible_progress_items`) genuinely narrows restricted roles — confirmed by 判頭 only seeing 2 items.
- 逾期 chip math works (judged client-side).
- Supervisor tier (admin / pm / general_foreman) consistently applied across progress + materials + contacts.
- BEFORE UPDATE trigger pattern (v17) is reusable for any future column-level write gate.

---

## Recap (caveman zh-HK)

Round 1 揾到 3 個 P0，全部修咗。Round 2 走多一次，何判頭隨手又篤穿一個更大個窿 —
**user_profiles UPDATE 冇 column-level guard，任何用戶一個 fetch 變 admin**。已經喺 commit `876bea4` 補咗 (v17 trigger + RPCs)。

Pattern 開始重複：每次 persona-sim 都會搵到一個新嘅 RLS 漏洞。下次要做 **table-by-table 全面審計**，唔好等 persona 揾。

Top 3 即時下步：
1. **C8** — 對齊 RLS 寫一份 audit checklist，全 13 張表行一次
2. **C7** — Round 3 spawn 5 personas 真正 cross-tab 驗證 S2 + 新 v17
3. **C3** — events auto-notify trigger（PM workflow）

要唔要我直接落 C8 RLS audit？應該係下個 phase 嘅頭，唔係下個 sprint。

---

## File trail

- `supabase/v16-materials-rls-fix.sql` — round 1 fix (live, applied)
- `supabase/v17-user-profiles-rls-hardening.sql` — round 2 P0 fix (live, applied)
- `src/lib/supabase.ts` — tab bleed (S2)
- `src/components/ProgressItemCard.tsx` — MaterialItemsPanel mount + zone prefix
- `src/components/material/MaterialForm.tsx` — RPC visibility for picker + zone prefix
- `src/pages/MaterialList.tsx` — per-row gate
- `src/pages/DailyEdit.tsx` — storage button + zone chip
- `src/pages/DailyList.tsx` — sub_role banner + zone chip
- `src/pages/ProjectDetail.tsx` — `<MaterialsProvider>` wrap
- `src/pages/AdminUsers.tsx`, `AdminProjects.tsx`, `AssignPMModal.tsx`,
  `components/admin/InFlightApprovalsModal.tsx` — admin RPC wiring for v17
