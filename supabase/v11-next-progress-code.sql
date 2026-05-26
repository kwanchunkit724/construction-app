-- =============================================================
-- v11-next-progress-code.sql
-- =============================================================
-- Auto-generate the `code` column for new progress items so
-- users stop having to invent numbering by hand.
--
-- Root items in a zone: numeric "01", "02", ... padded to two digits.
-- Child items: "<parent.code>-<next>" e.g., "02-01", "02-02".
-- Existing free-form codes (e.g., "1-01-01") are tolerated by the
-- regex; the function ignores siblings whose code doesn't match
-- the expected pattern when computing the next index.
--
-- Concurrency: two simultaneous inserts could pick the same code.
-- For the manual-UI scale here (one PM at a time per project),
-- relying on the in-app refresh is good enough; uniqueness is not
-- enforced at the DB level today.
-- =============================================================

create or replace function next_progress_code(
  p_project_id uuid,
  p_zone_id text,
  p_parent_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_code text;
  v_max_suffix int;
  v_parent_pattern text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from project_members
    where project_id = p_project_id and user_id = auth.uid() and status = 'approved'
  ) then
    raise exception 'not a member of this project';
  end if;

  if p_parent_id is null then
    -- Root: max numeric of zone roots + 1
    select coalesce(
      max((regexp_match(code, '^(\d+)$'))[1]::int), 0
    )
    into v_max_suffix
    from progress_items
    where project_id = p_project_id
      and zone_id is not distinct from p_zone_id
      and parent_id is null
      and code ~ '^\d+$';

    return lpad((v_max_suffix + 1)::text, 2, '0');
  end if;

  -- Child: pull parent's code, find max numeric suffix among siblings
  select code into v_parent_code
  from progress_items
  where id = p_parent_id and project_id = p_project_id;

  if v_parent_code is null then
    raise exception 'parent item not found in this project';
  end if;

  -- Escape regex metacharacters in the parent code before matching
  v_parent_pattern := regexp_replace(v_parent_code, '([.\-+*?()\[\]\\^$|])', '\\\1', 'g');

  select coalesce(
    max(
      (regexp_match(code, '^' || v_parent_pattern || '-(\d+)$'))[1]::int
    ),
    0
  )
  into v_max_suffix
  from progress_items
  where parent_id = p_parent_id
    and code ~ ('^' || v_parent_pattern || '-\d+$');

  return v_parent_code || '-' || lpad((v_max_suffix + 1)::text, 2, '0');
end;
$$;

revoke all on function next_progress_code(uuid, text, uuid) from public;
grant execute on function next_progress_code(uuid, text, uuid) to authenticated;

comment on function next_progress_code(uuid, text, uuid) is
'v1.2 auto-code generator. Pass parent_id = null for a root item in the given zone.';
