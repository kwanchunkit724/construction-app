# PROGRESS-TABLE-PROJECT-TYPES — 進度表點樣適配唔同工程類型

> Problem 4 deliverable · 2026-06-11
> Scope: make the progress table fit 小型工程 / 渠務 / 大樓維修 (MBIS/MWIS) alongside the
> current 大地盤/新建大樓 baseline — additively, backwards-compatible with live iOS data.

---

## 1. How the progress table works TODAY (grounded)

| Mechanism | Where | What it does |
|---|---|---|
| Tracking modes | `src/types.ts:72` — `TrackingMode = 'percentage' \| 'floors'` | Leaf items carry either a manual 0–100% (`actual_progress`) or a set of ticked floor labels |
| Floors = labelled checklist | `src/types.ts:89-90` `floor_labels: string[]`, `floors_completed: string[]`; `floorsToProgress` at `src/types.ts:109-112` | % = ticked/total, rounded. **Key insight: "floors" is already a generic labelled checklist** — labels are arbitrary strings stored in jsonb (`supabase/v3-5-progress-extras.sql:11-12`) |
| Planned % | `plannedProgressOf` `src/types.ts:131-147` | Time-linear between `planned_start`→`planned_end` vs today. Mode-agnostic |
| Status derivation | `deriveStatus` `src/types.ts:162-168` | `delayed` when actual < planned−5; `blocked` exists in the enum (`src/types.ts:71`) but **nothing ever sets it** — no UI path writes `blocked` |
| Rollup | `computeRollup` `src/types.ts:204-217` | **Equal-weight average over descendant leaves.** A 3-day 細項 counts the same as a 3-month one |
| Tree + grouping | `progress_items.parent_id/level/zone_id` (`supabase/v3-progress-schema.sql:13-17`); zones are free-form `{id,name}` jsonb on `projects` (`supabase/v2-schema.sql:34`) | 分區(zone) → 大項(L1) → 中項(L2) → 細項(L3+), rendered per-zone in `ZoneSection` (`src/pages/ProjectDetail.tsx:404-491`) |
| Auto-numbering | `next_progress_code` (`supabase/v11-next-progress-code.sql`) | Zone-scoped "01", child "01-01" — mode-agnostic |
| Update UX | `UpdateProgressModal.tsx:78-158` | Floors → tap-grid of labels; percentage → slider + 25/50/75/100 chips |
| Create UX | `CreateItemModal.tsx:414-507` | Mode picker (百分比/樓層) + auto floor generator (`B2…GF…nF`) |
| Audit trail | `progress_history` (`supabase/v3-5-progress-extras.sql:19-27`), written by `recordHistory` (`ProgressContext.tsx:172-184`) | Stores `actual_progress` + `floors_completed` per update |
| Period delta | `progress_snapshots` (`supabase/v25-progress-snapshots.sql`) | Per-leaf `actual_progress` keyed by period — % only |
| Export | `src/lib/export.ts:267` | Tracking column renders `x/y樓` for floors, blank for percentage |
| Hard zone dependency | `ProjectDetail.tsx:236-241` | **No zones ⇒ no progress items at all** ("此工地尚未設定分區 · 請 Admin 編輯工地加入分區") |

Everything below builds on two existing generalisable primitives: (a) `floor_labels`/`floors_completed` is a checklist engine wearing a 樓層 costume, and (b) % is the universal rollup currency — every mode just needs its own way to derive a %.

---

## 2. Role-play: what each person-in-charge actually needs

### 2.0 Baseline — 大地盤 / 新建大樓 (current fit: good)

**Persona:** 總承建商工地主任 on a 4-座 residential tower job, 30+ months.
- **Tracking unit:** 細項 % (groundwork, E&M) or floors topped-out / completed per trade.
- **Grouping:** 座 (zone) → 大項 (地基/上蓋/水電/裝修) → 細項.
- **KPIs:** actual vs time-planned %, ±variance (`ProgressItemCard.tsx:190-196`), four stat tiles (`ProjectDetail.tsx:226-231`).
- **Verdict:** the existing model was designed for exactly this. Keep as `general` template; zero behaviour change.

### 2.1 小型工程 — small works / shop fit-out / minor A&A

**Persona:** 判頭老闆 doing a 6-week 商場舖位裝修 (MWCS-registered minor works). One site = one shop. No 座, no floors. ~15–30 line items. He runs it from his phone between two other jobs.

**What his day looks like:** "拆卸完未？消防改喉搞掂未？商場夜晚先畀做嘢，聽日 landlord 巡場。" Binary done/not-done questions against a **handover date**, not percentage curves.

**Pain with today's table:**
1. **Zone wall:** he can't even add an item until an admin invents a fake 分區 (`ProjectDetail.tsx:236-241`). For a one-room job the zone concept is pure overhead.
2. **Fake precision:** a 0–100 slider on "裝假天花" (3 days) invites the eternal "70%". He needs ✅/❌ per task.
3. **No milestone framing:** what matters is the stage gate sequence 進場→拆卸→水電/消防→泥水→木工→油漆→傢俬→執漏→交場 and the dates the mall/FSD/landlord inspect.

- **Natural tracking unit:** the **task** (checklist tick), optionally grouped under a **stage/milestone**.
- **Grouping:** single implicit zone; L1 = stage (or 行頭 trade: 水電/泥水/木工/油漆), L2 = tasks.
- **Milestones/KPIs:** 距離交場 X 日 · 剩 Y 項未完 · 執漏 N 項 · next inspection date.
- **Table columns:** task · trade/stage · target date · done? · 邊個做 · (photo proof via existing drawings/issues).
- **Rollup:** % = done/total (optionally duration-weighted); headline is the countdown, not the %.

**Fit gap is small:** 'floors' mode with labels = task names already 90% works — it just *renders* as purple 樓層 chips (`UpdateProgressModal.tsx:74`, `ProgressItemCard.tsx:182-186`) and the auto-generator only makes floor names. This is a **relabelling + template problem**, not a new engine.

### 2.2 渠務 — drainage / sewerage (DSD-style jobs)

**Persona:** 判頭 laying 600m of DN300 sewer along a street for a DSD term contract, manhole to manhole, with road-opening permits and TTM (臨時交通) windows.

**What his day looks like:** "今日 MH3→MH4 嗰段掘咗 18 米，跌咗水位泵唔切，聽日落雨就停。" His brain works in **metres laid vs total metres per run**, and in **blockers** (雨/地下水/電纜改道/掘路紙未批) — not in % per se.

**Pain with today's table:**
1. **No quantity:** he must mentally convert 230m/600m → 38% and drag a slider. The audit trail (`progress_history.actual_progress`, int %) loses the metres — in a dispute "我哋嗰星期鋪咗 86 米" is the number that survives, not "+14%".
2. **Rollup mis-weights:** `computeRollup` (`src/types.ts:208`) averages leaves equally — a 250m run and a 12m house connection count the same, so the zone % lies.
3. **`blocked` status is dead:** weather/groundwater stoppages are his #1 reporting need, but `deriveStatus` can only produce delayed/in-progress; nothing records *why*.
4. **No production rate:** PM wants m/day and a forecast date, derivable from history if history stored quantities.

- **Natural tracking unit:** the **pipe-run** (MH→MH / chainage段) with `done_qty / total_qty` in **m**; secondary count units (manholes built, gullies, connections — 個).
- **Grouping:** zone = 街道/路段; L1 = run (MH1→MH2); optional L2 = stage per run (掘坑→落床→鋪管→包封→回填→修路) as child checklist items.
- **Milestones/KPIs:** Σm laid / Σm total (length-weighted) · m this period · m/day rate · runs complete · active blockers + reason.
- **Table columns:** run ID · 管徑/物料 · 總長 m · 已完成 m · % (derived) · status incl. 受阻(原因) · 更新日期.
- **Rollup:** **quantity-weighted**: Σdone/Σtotal across leaves sharing a unit; fall back to equal weight for mixed units.

### 2.3 大樓維修 — MBIS/MWIS (強制驗樓/驗窗 + 維修)

**Persona:** 承建商項目主任 doing 公契維修 for an 業主立案法團 under a 強制驗樓 statutory order: RI (註冊檢驗人員) inspected, issued a **schedule of defects** — 480 defects across 2 座 × 24 層 × 8 室 + 公用地方 + 外牆. Statutory compliance deadline on the Buildings Department order.

**What her day looks like:** "3座15樓C室個窗鉸換咗未？RI 幾時嚟覆檢 batch 2？仲有幾多個 spalling 未執？外牆棚下個月要拆。" Her world is a **defect register**: each defect has a location, a type, a repair state, and before/after photos that the RI and BD will demand.

**Pain with today's table:**
1. **Tracking unit mismatch:** a defect isn't a % and isn't a binary tick — it's a **state machine**: 未處理 → 維修中 → 已修復 → 待覆檢 → RI已簽收. Floors mode's boolean tick can't show "fixed but not yet signed off", which is exactly the dispute-prone gap.
2. **Two pivots needed:** by location (座→樓→室) for access/scaffolding planning AND by defect type (石屎剝落/鋼筋外露/窗/滲水/批盪) for trade dispatch. Today only the zone→tree pivot exists.
3. **Statutory deadline invisible:** `planned_end` exists per item but there's no project/order-level deadline KPI ("距離法定限期 92 日").
4. **Evidence:** before/after photos per defect are the product's core promise (audit trail that survives disputes) — today photos only attach via issues or drawings, not to a progress unit.

- **Natural tracking unit:** the **defect** (or the **unit/室** as a label whose value is a *state*, not a boolean).
- **Grouping:** 座 (zone) → 樓層 (L1) → 室/位置 (labels); cross-cut by defect type.
- **Milestones/KPIs:** defects closed/total · 待覆檢 count · per-floor unit completion · days to statutory deadline · scaffold up/down dates.
- **Table columns:** location · type · qty (e.g. spalling m²) · state · 判頭 · before/after 相 · RI簽收日期.
- **Rollup:** % = signed-off/total (with 已修復 visible as a second number); zone header shows "已修復 310 / 已簽收 270 / 共 480".

---

## 3. Recommended design — project-type template driving mode + columns + grouping

### 3.1 Concept

One new project-level field — `projects.project_type` — selects a **template**. A template is pure *configuration*, not new permissions or new tables for the core flow:

| `project_type` | zh | Zone noun | Default mode | Allowed modes | Headline KPI tiles |
|---|---|---|---|---|---|
| `general` (default) | 大地盤/新建 | 分區/座 | `percentage` | percentage, floors, checklist, quantity | 已完成/進行中/落後/未開始 (today's tiles, `ProjectDetail.tsx:226-231`) |
| `small_works` | 小型工程/裝修 | (hidden — auto single zone) | `checklist` | checklist, percentage | 距離交場 X 日 · 剩 Y 項 · 受阻 N |
| `drainage` | 渠務/地下管線 | 路段 | `quantity` | quantity, checklist, percentage | 已鋪 Σm/Σm · 本期 +m · 受阻 N · 完成段數 |
| `maintenance` | 大樓維修 (MBIS/MWIS) | 座 | `unit_status` | unit_status, quantity, checklist | 已簽收/已修復/共 N · 距法定限期 X 日 |

The template drives, per project:
1. **Which tracking modes the CreateItemModal offers** (and which is pre-selected) — today's hardcoded two-button picker (`CreateItemModal.tsx:417-440`) becomes data-driven.
2. **Vocabulary** — zone noun, label noun (樓層/工序/室), level names (大項/中項/細項 vs 路段/管段/工序).
3. **Stat tiles + zone-header KPI** in `ProjectDetail.tsx` / `ZoneSection`.
4. **Export columns** in `src/lib/export.ts`.
5. **Zone bootstrap** — `small_works` auto-creates one zone `{id:'A', name:'工地'}` at project creation and hides the zone header UI, removing the `ProjectDetail.tsx:236-241` dead-end.

### 3.2 New tracking modes (additive to `'percentage' | 'floors'`)

All three reuse the proven pattern *labels + per-label state → derived `actual_progress` %*, so `plannedProgressOf`, `deriveStatus`, variance display, snapshots, and history keep working untouched.

**a) `checklist` (小型工程)** — literally `floors` with different rendering and label source.
- Storage: reuse `floor_labels` (= task names) + `floors_completed`. No new columns.
- % derivation: existing `floorsToProgress` (`src/types.ts:109-112`).
- UI: `UpdateProgressModal` renders a vertical tick-list (label + checkbox + 44px rows) instead of the 4-col floor grid; card badge shows `✓ x/y項` instead of `Layers x/y` (`ProgressItemCard.tsx:182-186`); CreateItemModal swaps the floor auto-generator for a plain "工序名（每行一項）" textarea — the custom-floors textarea (`CreateItemModal.tsx:481-490`) already is that.

**b) `quantity` (渠務)** — linear/measured work.
- Storage: 3 new nullable columns on `progress_items`: `qty_total numeric`, `qty_done numeric default 0`, `qty_unit text` (`'m' | 'm2' | 'm3' | '個' | '件'` — free text with suggestions, no check constraint so trades can extend).
- % derivation: new helper `qtyToProgress(done, total)` in `src/types.ts` → writes `actual_progress` the same way `updateFloors` does (`ProgressContext.tsx:225-243`), so all rollup/status/export consumers see a normal %.
- History: add `qty_done numeric` column to `progress_history` so the audit trail keeps the metres ("本期 +86m"), and `progress_snapshots` gains `qty_done numeric` for period deltas in real units.
- UI: update modal = big numeric input (`已完成 (m)`) + stepper, with total shown; card shows `230/600m` badge; new context method `updateQuantity(id, qtyDone, notes)`.

**c) `unit_status` (大樓維修)** — labels with a state machine instead of a boolean.
- Storage: 1 new column `label_status jsonb not null default '{}'` on `progress_items` — map of label → `'pending' | 'fixing' | 'fixed' | 'reinspect' | 'signed_off'`. Labels still come from `floor_labels` (here: 室/位置/defect IDs, e.g. generated `15/F-A…15/F-H`).
- % derivation: `signed_off / total` (and the card shows the secondary "已修復" count). `floors_completed` is kept in sync as "labels at signed_off" so legacy consumers (HistoryModal `src/components/HistoryModal.tsx:75-77`, export) degrade gracefully.
- Statutory deadline: reuse `planned_end` on the L1 item ("法定命令" root item) — zero schema cost; the maintenance template's KPI tile reads the earliest L1 `planned_end` as 限期.
- UI: update modal renders each label as a row with a 5-state segmented chip (tap to cycle); generator in CreateItemModal makes 樓×室 grids (same spirit as the existing floor auto-generator at `CreateItemModal.tsx:161-170`).
- Defect *type* pivot: keep v1 simple — defect type is the 中項 (one L2 per type under each 座/樓), so the existing tree gives the trade-dispatch pivot without a new table. A dedicated `defects` table with photo FKs is the v2 upgrade path if MBIS users need per-defect photos beyond the issues/drawings linkage.

**d) Blockers (all types, biggest win for drainage)** — make the dead `blocked` status real.
- Storage: `blocked_reason text` (nullable) on `progress_items`; when set, displayed status forces `blocked` (today `deriveStatus` can never return it, `src/types.ts:162-168`).
- UI: UpdateProgressModal gains a "受阻" toggle + reason picker (雨天/地下水/掘路紙/物料/其他) — recorded into `progress_history.notes` prefixed, so the dispute trail shows when and why work stopped.

### 3.3 Rollup change — weighted `computeRollup`

`computeRollup` (`src/types.ts:204-217`) gains weighting, defaulting to today's behaviour:
- weight = `qty_total` when the leaf is `quantity` mode **and** all sibling quantity leaves share `qty_unit` (then also surface `Σdone/Σtotal` alongside the %);
- weight = `floor_labels.length` optionally for floors/checklist/unit_status (count-weighted);
- weight = 1 otherwise → **identical numbers for every existing project**.
Planned % stays the schedule-derived average over scheduled leaves (unchanged logic, weights applied symmetrically).

### 3.4 Data model — migration `supabase/v38-progress-project-types.sql` (next free version)

All additive; no destructive change to `progress_items` or `user_profiles` (App Store constraint respected):

```text
alter table projects        add column if not exists project_type text not null default 'general'
                              check (project_type in ('general','small_works','drainage','maintenance'));
alter table progress_items  drop constraint progress_items_tracking_mode_check;  -- widen enum
alter table progress_items  add constraint ... check (tracking_mode in
                              ('percentage','floors','checklist','quantity','unit_status'));
alter table progress_items  add column if not exists qty_total numeric,
                            add column if not exists qty_done numeric not null default 0,
                            add column if not exists qty_unit text,
                            add column if not exists label_status jsonb not null default '{}'::jsonb,
                            add column if not exists blocked_reason text;
alter table progress_history  add column if not exists qty_done numeric,
                              add column if not exists label_status jsonb;
alter table progress_snapshots add column if not exists qty_done numeric;
```

- RLS: untouched — all new columns ride the existing row policies (`v3-progress-schema.sql:74-90`, v27 membership-based rights).
- `get_visible_progress_items` RPC (`ProgressContext.tsx:100`): `select *`-style RPCs must be re-created to include new columns — verify its column list in v11/v12 and extend in the same migration.
- `next_progress_code`: unaffected (mode-agnostic).
- Realtime: same table, same channel (`ProgressContext.tsx:125-132`).
- Old clients (live iOS v1.3): they never write the new columns (defaults cover inserts at `ProgressContext.tsx:146-166`) and never see new modes unless a project uses them; a new-mode item renders in an old client as a percentage row (since `actual_progress` is always materialised) — graceful, read-correct degradation. Gate template selection behind the new app version if desired.

### 3.5 TS / UI change list (high level)

| File | Change |
|---|---|
| `src/types.ts` | extend `TrackingMode`; add `ProjectType`, `PROJECT_TYPE_ZH`, `UnitState`, `UNIT_STATE_ZH`; add `qty_total/qty_done/qty_unit/label_status/blocked_reason` to `ProgressItem`; `qtyToProgress`, `unitStatusToProgress`; weighted `computeRollup`; add `project_type` to `Project` |
| **new** `src/lib/progressTemplates.ts` | template registry: `{ allowedModes, defaultMode, zoneNoun, levelNouns, kpiTiles, autoZone, updateEditor }` keyed by `ProjectType` — single source for all per-type UI switching |
| `src/contexts/ProgressContext.tsx` | `addItem` accepts qty fields; new `updateQuantity`, `updateUnitStatus`, `setBlocked`; history writes include qty/label_status |
| `src/components/CreateItemModal.tsx` | mode picker driven by template; per-mode sub-forms (qty total+unit / task textarea / 樓×室 generator) |
| `src/components/UpdateProgressModal.tsx` | per-mode editor branch (tick-list / numeric m / state-chips) + 受阻 toggle |
| `src/components/ProgressItemCard.tsx` | per-mode badge (`x/y項`, `230/600m`, `簽收 a · 修復 b / n`), blocked pill with reason tooltip |
| `src/pages/ProjectDetail.tsx` | template-driven stat tiles + zone noun; hide zone chrome for `small_works`; deadline countdown tile for `maintenance` |
| `src/pages/AdminProjects.tsx` (project create/edit) | project-type selector at creation (admin-only, matches existing admin CRUD in `ProjectsContext`) |
| `src/lib/export.ts` | tracking column per mode (extend the `:267` ternary); quantity exports show real units; maintenance export adds state counts |
| `src/components/HistoryModal.tsx` | render qty deltas and state changes alongside the existing floor chips |

### 3.6 Rollout phases (each independently shippable, in order of value/cost)

1. **P1 — `project_type` + template registry + `checklist` mode + auto-zone for small works.** Almost no schema (only `projects.project_type`; checklist reuses floors storage). Unblocks the 小型工程 segment — likely the largest count of potential HK customers.
2. **P2 — `quantity` mode + weighted rollup + qty history/snapshots + blocked reason.** The drainage story; also fixes the equal-weight rollup distortion for everyone.
3. **P3 — `unit_status` mode + maintenance template + deadline tile.** The MBIS/MWIS story; heaviest UI (state chips, 樓×室 generator).
4. **P4 (later) — defect register table** with per-defect photos + RI sign-off linkage to the approval chain (`Approval.doc_type` pattern, `src/types.ts:401-412`) if maintenance users outgrow the label-state model.

### 3.7 Risks / non-goals

- **Don't migrate existing rows.** `general` default + unchanged enums means live data renders identically; the only behavioural change for existing projects is the (opt-in count-)weighted rollup — ship weight=1 for floors/percentage to keep numbers byte-identical.
- **Mixed-unit rollups** (m + 個 in one branch) fall back to equal weight and suppress the Σ display — never sum apples and oranges.
- **Per-label state jsonb growth**: a 480-defect 座 as one item is fine (jsonb ~20KB), but the template should nudge structure (one item per floor, ≤ ~30 labels) — also better for assignment granularity (`assigned_to` is per-item).
- **`tracking_mode` constraint widening** requires drop+add of the check constraint — wrap in one transaction; it does not rewrite the table.
- Changing a project's `project_type` after creation only changes UI defaults/vocabulary — existing items keep their own `tracking_mode`, so it is always safe.
