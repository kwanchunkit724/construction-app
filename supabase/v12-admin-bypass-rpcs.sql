-- =============================================================
-- v12-admin-bypass-rpcs.sql
-- =============================================================
-- Hotfix for get_timetable + next_progress_code RPCs.
-- Same admin-membership bug fixed in v12-admin-bypass-v11-tables.sql.
-- Both RPCs threw "not a member of this project" for admin users
-- because admins don't carry per-project membership rows.
-- =============================================================

create or replace function get_timetable(
  p_project_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table(
  source text,
  ref_id uuid,
  occurs_at timestamptz,
  title text,
  meta jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not user_is_admin() and not exists (
    select 1 from project_members
    where project_id = p_project_id
      and user_id = auth.uid()
      and status = 'approved'
  ) then
    raise exception 'not a member of this project';
  end if;

  return query
    select
      'material'::text as source,
      m.id as ref_id,
      coalesce(m.arrived_at, m.planned_arrival_at) as occurs_at,
      ('物料: ' || m.name || ' ' || m.qty_needed::text || ' ' || m.unit) as title,
      jsonb_build_object(
        'status', m.status,
        'qty_needed', m.qty_needed,
        'qty_arrived', m.qty_arrived,
        'item_ids', m.item_ids,
        'requested_by', m.requested_by
      ) as meta
    from materials m
    where m.project_id = p_project_id
      and coalesce(m.arrived_at, m.planned_arrival_at) between p_from and p_to

    union all

    select
      'completion'::text,
      pi.id,
      (pi.planned_end::timestamp at time zone 'Asia/Hong_Kong') + interval '12 hours',
      ('完工: ' || pi.code || ' ' || pi.title),
      jsonb_build_object(
        'status', pi.status,
        'actual_progress', pi.actual_progress,
        'planned_progress', pi.planned_progress,
        'zone_id', pi.zone_id
      )
    from progress_items pi
    where pi.project_id = p_project_id
      and pi.planned_end is not null
      and (pi.planned_end::timestamp at time zone 'Asia/Hong_Kong') + interval '12 hours'
          between p_from and p_to

    union all

    select
      'event'::text,
      e.id,
      e.starts_at,
      e.title,
      jsonb_build_object(
        'description', e.description,
        'location', e.location,
        'ends_at', e.ends_at,
        'event_type', e.event_type,
        'created_by', e.created_by
      )
    from events e
    where e.project_id = p_project_id
      and e.starts_at between p_from and p_to

    order by 3;
end;
$$;

revoke all on function get_timetable(uuid, timestamptz, timestamptz) from public;
grant execute on function get_timetable(uuid, timestamptz, timestamptz) to authenticated;

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
  if not user_is_admin() and not exists (
    select 1 from project_members
    where project_id = p_project_id and user_id = auth.uid() and status = 'approved'
  ) then
    raise exception 'not a member of this project';
  end if;

  if p_parent_id is null then
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

  select code into v_parent_code
  from progress_items
  where id = p_parent_id and project_id = p_project_id;

  if v_parent_code is null then
    raise exception 'parent item not found in this project';
  end if;

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
