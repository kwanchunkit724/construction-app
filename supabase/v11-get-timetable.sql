-- =============================================================
-- v11-get-timetable.sql
-- =============================================================
-- Unified timetable feed for v1.2. The page passes a [from, to]
-- range (typically week or month) and gets back a single ordered
-- stream the UI can group by day:
--
--   source='material'   — planned arrivals (or actual arrived_at
--                          once recorded). Title shows qty + unit.
--   source='completion' — progress items with planned_end inside
--                          the range. Title shows code + title.
--   source='event'      — manual rows from public.events.
--
-- All three sources already enforce their own RLS for direct
-- SELECTs, but this RPC adds a project-membership gate at the
-- entry point so non-members can't enumerate even via timestamp
-- side-channels.
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
  if not exists (
    select 1 from project_members
    where project_id = p_project_id
      and user_id = auth.uid()
      and status = 'approved'
  ) then
    raise exception 'not a member of this project';
  end if;

  return query
    -- Material arrivals (prefer actual arrived_at when present)
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

    -- Progress completions (planned_end as midday HKT so they sit
    -- in the middle of the day instead of UTC midnight)
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

    -- Manual events
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

comment on function get_timetable(uuid, timestamptz, timestamptz) is
'v1.2 timetable union — materials.planned_arrival_at + progress.planned_end + events.starts_at, gated by project membership.';
