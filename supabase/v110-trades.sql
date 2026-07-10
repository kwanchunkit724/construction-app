-- =============================================================
-- v110-trades.sql   (進度表結構 T1 — 工種字典 + per-item trade 標籤)
-- =============================================================
-- Design verdict (progress-structure panel): 位置行樹、工種行標籤、判頭行指派.
-- Trades are a DICTIONARY TABLE, not a hard enum (the panel's fatal-flaw fix:
-- an enum welded into routing/reports is unchangeable; a dictionary row isn't).
-- Seeded from the HK industry taxonomy the owner supplied: Civil / 上蓋(結構+
-- ABWF) / BS(HVAC/電力/FSI/P&D/升降機) / 裝修. acceptance_role rides the
-- dictionary row so per-trade statutory acceptance (e.g. FSI) is set ONCE.
--
-- progress_items.trade is a nullable text tag — display/grouping/export only;
-- tree semantics untouched. NULL on every existing row = 未分類 = behaviour
-- identical to today (same additive pattern as v43/v57/v107/v109).
-- =============================================================

create table if not exists trades (
  code text primary key,              -- e.g. 'bs.fsi'
  name_zh text not null,              -- 消防 (FSI)
  group_zh text not null,             -- 屋宇裝備
  acceptance_role text,               -- optional default 驗收人 role hint
  sort_order integer not null default 0
);

alter table trades enable row level security;
drop policy if exists trades_select on trades;
create policy trades_select on trades for select to authenticated using (true);
-- writes: admin only (global standard taxonomy). No insert/update/delete policy
-- for authenticated = denied; admin manages via service/SQL.

insert into trades (code, name_zh, group_zh, acceptance_role, sort_order) values
  ('civil',              '土木工程',        '土木',     null,   10),
  ('superstructure.rc',  '結構 (RC)',       '上蓋',     null,   20),
  ('superstructure.abwf','飾面 (ABWF)',     '上蓋',     null,   21),
  ('bs.hvac',            '空調通風 (HVAC)', '屋宇裝備', null,   30),
  ('bs.elec',            '電力 (Electrical)','屋宇裝備', null,  31),
  ('bs.fsi',             '消防 (FSI)',      '屋宇裝備', 'safety_officer', 32),
  ('bs.pd',              '水喉渠務 (P&D)',  '屋宇裝備', null,   33),
  ('bs.lift',            '升降機/扶梯',     '屋宇裝備', null,   34),
  ('fitout',             '室內裝修',        '裝修',     null,   40)
on conflict (code) do nothing;

alter table progress_items add column if not exists trade text references trades(code);
create index if not exists idx_progress_items_trade on progress_items(trade) where trade is not null;

-- =============================================================
-- Post-apply verification (EXECUTE, not source):
--   select count(*) from trades;                                   -> 9
--   select count(*) from progress_items where trade is not null;   -> 0 (defaults clean)
--   -- as any member: select from trades -> 9 rows; insert -> RLS denied.
--   -- update progress_items set trade='bs.fsi' (as manager) -> ok; ='xxx' -> FK error.
-- =============================================================
