-- =============================================================
-- v107-progress-acceptance.sql   (進度表 #3 — per-item 驗收, E1-E3 as decided)
-- =============================================================
-- Each progress item can be flagged 需驗收 (acceptance_required). Per the
-- owner's decisions: E1 any member who can already update the item may tick
-- 完成驗收 (no per-role routing); E2 a simple standalone update (deliberately
-- NOT wired to the RISC module); E3 完成驗收先算完成 — a leaf at 100% that
-- still awaits acceptance reports 進行中, so no rollup / export / KPI counts
-- un-accepted work as done (enforced client-side in deriveLeafStatus /
-- computeRollup; % math unchanged).
--
-- Additive only: three columns, all default/nullable — every existing row gets
-- acceptance_required=false = no acceptance gate = behaviour identical to today.
-- Authorization: intentionally NO new RLS surface — writes ride the existing
-- progress_items UPDATE policy (same people who can tick progress can tick
-- acceptance). The only server guard: the ACCEPTOR IDENTITY cannot be forged —
-- when accepted_at transitions from NULL, accepted_by is pinned to auth.uid()
-- (v55f lesson: never trust a client-supplied privileged column).
-- =============================================================

alter table progress_items add column if not exists acceptance_required boolean not null default false;
alter table progress_items add column if not exists accepted_by uuid references user_profiles(id);
alter table progress_items add column if not exists accepted_at timestamptz;

create or replace function guard_progress_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role / SECURITY DEFINER tooling bypass (mirrors v69).
  if auth.uid() is null then
    return new;
  end if;
  -- Newly accepted → the acceptor is the acting user, full stop.
  if new.accepted_at is not null and old.accepted_at is null then
    new.accepted_by := auth.uid();
  end if;
  -- Cleared → clear both (no orphaned accepted_by).
  if new.accepted_at is null then
    new.accepted_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_progress_acceptance on progress_items;
create trigger trg_guard_progress_acceptance
  before update on progress_items
  for each row execute function guard_progress_acceptance();

-- =============================================================
-- Post-apply verification (EXECUTE, not source):
--   select column_name from information_schema.columns
--     where table_name='progress_items' and column_name like 'accept%';  -> 3 rows
--   -- as a member with update rights (set local role authenticated + jwt):
--   --   update progress_items set accepted_at=now(), accepted_by='<someone else>'
--   --     where id=<leaf> returning accepted_by;   -> accepted_by FORCED to actor
--   --   update ... set accepted_at=null returning accepted_by;  -> both null
--   -- existing rows: acceptance_required=false → app behaviour unchanged.
-- =============================================================
