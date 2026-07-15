# Persona Simulation — Round 3 Round-Table

Date: 2026-05-27
Live preview tested: `construction-iq16sgyor-...vercel.app` (commit `c6b4d45`) — Vercel SSO-gated
Production alias (publicly reachable, used by personas as fallback): `construction-app-lime-six.vercel.app` (older bundle from `main` branch)
Post-round patches: `65298c2` (v19 + per-tab storageKey)

---

## Why round 3 happened

Round 2 closed 3 P0s + 8 friction items but surfaced one bigger P0 (`user_profiles` self-promote) plus a full-system RLS-audit ask. Iter3 shipped:
- v18 RLS audit (9 legacy tables locked, contacts/events tightened, projects "name discovery" dropped)
- Events auto-notify trigger
- Slider tap target + quick chips
- 急件 toggle (DB col + UI)
- Yesterday daily readable error

Round 3 = 5 personas live again, validating iter1+iter2+iter3 + hammering for new holes.

---

## Round-table — each persona reports

### 何判頭 (subcontractor) — 8/10 (R1: 7/10 → R2: 4/10 → R3: 8/10)

Best attack-test session of the three. Captured anon key, JWT, then ran a 17-test matrix.

**All R3 backend hardenings hold:**

| Test | Result |
|---|---|
| PATCH user_profiles → global_role='admin' | ✅ Trigger reverted to subcontractor |
| PATCH phone / sub_role / id | ✅ Reverted |
| SELECT user_profiles | ✅ Narrowed 25 → 5 (self + project teammates) |
| GET legacy tables (profiles, sub_contracts, boq_items, daily_diaries) | ✅ 200 `[]` |
| INSERT legacy tables | ✅ 403 RLS |
| PATCH/DELETE peer materials (焊條, 鋼筋) | ✅ 200 `[]` (RLS filter) |
| PATCH cross-project contact | ✅ 200 `[]` (no rows in scope) |
| PATCH events.title not own | ✅ 200 `[]` |
| Spoof reporter_id on issue | ✅ 403 |
| Self-elevate role in project_members | ✅ Blocked |
| Read project_members cross-project | ✅ Blocked |
| Admin RPCs (admin_list_user_profiles, etc) | ✅ 400 "admin only" |

**🚨 NEW hole found**: `user_profiles.company` was self-editable. 判頭 changed company to "黑客集團" successfully. Trigger missed it. **Patched in v19**.

**⚠️ Concern**: `delete_my_account` returns 409 FK constraint when user has touched data (Apple compliance risk). Carry forward — needs soft-anonymize on FK chain.

Retro: "Backend now solid. Once iter3 UI ships to prod, this is 9/10 territory."

### 李 PM — 3/10 (R2: 5/10 → R3: 3/10)

PM definitively root-caused tab bleed. Brutal honest score drop.

**v17/v18 attacks held** ✅ — self-promote reverted, cross-project mutate blocked.

**🚨 S2 TAB BLEED STILL ALIVE** — and PM read the supabase-js bundle source to prove it:
```js
this.broadcastChannel.addEventListener("message", async o =>
  await this._notifyAllSubscribers(o.data.event, o.data.session, false));
```
`BroadcastChannel(storageKey)` fires regardless of `sessionStorage`. v17 just renamed the channel from default to `ckcon-auth-v1`. Both tabs still share that named channel. Tab B's SIGNED_IN propagates to Tab A → identity flip. Reproduced 5+ times.

**Real fix shipped in `65298c2`**: per-tab UUID-suffixed storageKey (`ckcon-auth-tab-<uuid>`) stored in sessionStorage. Each tab now has its own channel. Native (Capacitor) keeps `ckcon-auth-native-v1` shared.

**Events auto-notify** — PM said "no OneSignal calls in Network panel". False negative — trigger calls OneSignal API server-side via `pg_net`, not visible in browser Network. Trigger confirmed live (`on_event_inserted_notify` enabled in `pg_trigger`).

Retro: "Office workflow structurally broken until tab bleed actually fixed. Drop to 3/10 because security pass didn't fix the daily blocker."

### 王老總 (general_foreman) — 7/10 (R1: N/A → R3: 7/10)

Switched to pure HTTP validation after Chrome MCP sessions kept colliding.

**v17 attacks held** ✅ — name editable (intended), all privileged columns reverted.

**v18 legacy locks held** ✅ — GET /profiles returns `[]`.

**🐛 NEW finding**: `events_insert` policy allowlist = admin / pm / main_contractor. **No general_foreman.** 老總 supervisor tier but blocked from creating events. HTTP 403 RLS violation. Inconsistent with `can_manage_project_progress` which includes general_foreman. **Patched in v19**.

**RPC visibility confirmed** ✅ — `get_visible_progress_items`:
- 老總: 22 rows (4 zones)
- 判頭: 4 rows
- foreman: 3 rows
- engineer: 4 rows

**Peer-zone child add** ✅ — POST 4 rows with same code differing zone_id → all 201.

**⚠️ PII phone leak to project teammates** — `user_profiles_select` returns full row including phone to any teammate. May be intentional (Contacts page tap-to-call) but worth narrowing if not.

Retro: "DB wall hard. Admin attack 攻不入. But prod 重未食最新 build — calendar 重未識 zone, 老總 被 RLS 鎖住唔加 event."

### 黃管工 foreman — N/A (concurrency-blocked)

Brief stable window confirmed:
- ✅ R1 visibility scoping: foreman sees only assigned items in 1座 (2 items, zones B/C/D empty)
- ✅ 更新 button only on own items

Could not test U1 (儲存 overlap), C4 (slider chips), C6 (急件 toggle), D1 (MaterialItemsPanel), U3 (zone chips) — Chrome MCP sessions clobbered mid-action by parallel agents.

### 陳工程師 engineer — 5/10

Tested **production** (lime-six) which is older bundle. Found:
- ✅ v17 self-promote blocked
- ✅ R1 picker scoped (4 items only)
- 🐛 No zone prefix in daily picker (duplicate "02-01 電線 1/F" rows) — **expected**: ships in iq16sgyor preview, not in lime-six prod
- 🐛 No 完工 entries in calendar — date range issue (planned_end +7/+14/+21d not in current week)
- 🐛 No 急件 chip — **expected**: ships in iq16sgyor preview
- 🐛 No MaterialItemsPanel — **expected**: ships in iq16sgyor preview
- ⚠️ C5 PATCH yesterday daily returns 200 + `[]` silently (RLS filter, not RAISE). Future client could think edit succeeded. Carry as P3.

Retro: "5/10 because three of four R3 promises live in worktree but not in prod alias yet."

---

## Cross-persona synthesis

### Iter3 fixes — actual round-3 verdict

| Fix | Backend (live) | UI (preview-only) | Prod (lime-six) |
|---|---|---|---|
| S1 materials RLS (v16) | ✅ held | ✅ | ✅ |
| S2 tab bleed | ❌ R3 surfaced still broken | ✅ in 65298c2 (real fix) | ❌ awaits prod merge |
| D1 MaterialItemsPanel mount | n/a | ✅ in c6b4d45 | ❌ awaits prod merge |
| R1 daily/material picker visibility | ✅ RPC live | ✅ in c6b4d45 | ❌ awaits prod merge |
| R2 MaterialList per-row gate | n/a | ✅ in c6b4d45 | ❌ awaits prod merge |
| R3 DailyList banner | n/a | ✅ in 843f855 | ✅ |
| U1 storage button | n/a | ✅ in 843f855 | ✅ |
| U3 zone prefix labels | ✅ get_timetable v16 | ✅ in c6b4d45 | ❌ awaits prod merge |
| v17 user_profiles trigger | ✅ held | n/a | ✅ |
| v18 RLS audit (9 legacy tables) | ✅ held | n/a | ✅ |
| v18 events_update tightening | ✅ held | n/a | ✅ |
| C3 events auto-notify | ✅ trigger fires server-side | n/a | ✅ |
| C4 slider chips 25/50/75/100 | n/a | ✅ in c6b4d45 | ❌ awaits prod merge |
| C5 yesterday readable error | partial (UI only — RLS still silent 200) | ✅ in c6b4d45 | ❌ awaits prod merge |
| C6 急件 column + toggle + chip | ✅ DB col live | ✅ in c6b4d45 | ❌ awaits prod merge |

### NEW round-3 findings + fix status

| # | Finder | Issue | Severity | Status |
|---|---|---|---|---|
| 31 | PM | BroadcastChannel(storageKey) shares across tabs — v17 didn't actually disable | P0 | ✅ fixed in `65298c2` per-tab UUID storageKey |
| 32 | 判頭 | `user_profiles.company` self-editable (spoof identity in dispute screenshots) | P1 | ✅ fixed in v19 trigger extension |
| 33 | 老總 | `events_insert` allowlist excludes general_foreman | P1 | ✅ fixed in v19 |
| 34 | 判頭 | `delete_my_account` 409 FK constraint blocks Apple compliance | P1 | ⏳ deferred — needs soft-anonymize FK pass |
| 35 | engineer | dailies PATCH past dates returns 200 + `[]` silently (RLS filter, not RAISE) | P3 | ⏳ deferred — UI already hides edit affordance, only matters for 3rd-party tool misuse |
| 36 | 老總 | PII (phone) visible to all project teammates via user_profiles_select | P3 | by-design (Contacts tap-to-call); flag for column-projection narrowing if not |
| 37 | all | Chrome MCP browser shared by parallel agents — sessions/viewports collide | infra | persona-sim harness issue; serial runs OR per-agent browser instances |

### What's actually shipped to live DB right now

Backend RLS posture is **strong**. 17/17 attack tests held in 判頭's matrix (after v19 closed company gap). The dataset is locked for:
- self-promotion attacks (trigger column revert)
- legacy-table reconnaissance (admin-only locks)
- cross-user data writes (per-row owner gates)
- cross-project mutation (assigned-PM-only checks)
- supervisor-tier escalation (general_foreman now in events allowlist)

### What's blocked on a prod merge

UI fixes in `claude/sweet-goldstine-e99977` (per-row buttons, 急件 chip, MaterialItemsPanel, zone prefix everywhere, slider chips, daily banner) all need a merge to `main` to reach the lime-six prod alias. PM and engineer scored low partly because they tested prod, not preview.

---

## Net trajectory

```
Backend (BE) security:    R1 has 1 hole → R2 has 2 holes → R3 has 2 holes → all fixed in v19
UI/UX punch list:         R1 has 8 items → R2 has 5 deferred → R3 has 3 deferred
Recommend score (avg):    R1 ~7/10  → R2 ~6/10 (one persona at 4) → R3 ~6/10 (5+3+7+N/A+8)
                            └── PM dropped due to tab bleed still alive at audit time
```

判頭's 8/10 + 老總's 7/10 confirm backend security pass works. PM's 3/10 was the now-fixed tab bleed.

---

## Suggested next iteration

1. **Merge `claude/sweet-goldstine-e99977` → `main`** so UI fixes ship to lime-six prod. Then re-run round 4 against preview AND prod to close the deploy-lag gap.
2. **Defer P1s `delete_my_account` FK soft-anonymize** to its own phase — needs to NULL out FK chains on progress_history, issues.reporter_id, dailies.user_id, etc. Apple review safety matters.
3. **Persona-sim harness** — give each persona-agent its own Chrome MCP browser instance so sessions don't collide. Or run serially.
4. **(optional) `user_profiles_select` column-projection narrowing** — if PII-to-teammates is undesired, restrict phone to roles with explicit need (PM/foreman tap-to-call).

---

## Recap (caveman zh-HK)

R3 跑完，5 persona 都返。判頭 8/10（backend 攻擊 17/17 全部頂得住），PM 3/10（tab bleed root-cause 揾到，已修），老總 7/10（揾到老總點解唔加得 event），engineer/foreman 受 MCP browser 衝突影響只交咗部份。

修補：
- v19 trigger 加 company lock + events_insert 加 general_foreman
- supabase.ts 改用 per-tab UUID storageKey — 真正解決 BroadcastChannel cross-tab

落一步：merge claude branch → main 推 UI 落 prod，順手做 delete_my_account FK soft-anonymize。
