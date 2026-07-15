-- =============================================================
-- seed-fixes.sql — demo-data fixes for the 4 [DEMO] projects
-- (the seed-data bugs from SIMULATION-REPORT.md). Idempotent-ish; safe to re-run.
-- =============================================================
begin;

-- ── (1) Worker-tick dead path ────────────────────────────────────────────────
-- The seeds never set assigned_to, so worker 60001006 (+ 判頭 60001005) cannot
-- update ANY progress item (canUpdateItem only allows assigned/delegated items).
-- Assign the first few in-progress LEAF 細項 in each project to them so the
-- "前線更新進度" demo path works.
update progress_items set assigned_to = array[(select id from user_profiles where phone = '60001006')]
where id in (
  select id from (
    select p.id, row_number() over (partition by p.project_id order by p.code) rn
    from progress_items p
    where p.project_id in ('d0000001-0001-0001-0001-000000000001','d0000002-0002-0002-0002-000000000002',
                           'd0000003-0003-0003-0003-000000000003','d0000004-0004-0004-0004-000000000004')
      and not exists (select 1 from progress_items c where c.parent_id = p.id)   -- leaf
      and p.status in ('in-progress','not-started','delayed')
      and (p.assigned_to is null or p.assigned_to = '{}')
  ) t where t.rn <= 3
);
-- delegate a couple of quantity leaves to the 判頭 (the persona who lays the pipe)
update progress_items set delegated_to = array[(select id from user_profiles where phone = '60001005')]
where id in (
  select id from (
    select p.id, row_number() over (partition by p.project_id order by p.code desc) rn
    from progress_items p
    where p.project_id in ('d0000003-0003-0003-0003-000000000003','d0000001-0001-0001-0001-000000000001')
      and not exists (select 1 from progress_items c where c.parent_id = p.id)
      and p.tracking_mode = 'quantity'
      and (p.delegated_to is null or p.delegated_to = '{}')
  ) t where t.rn <= 2
);

-- ── (2) unit_status vocabulary mismatch (大樓維修 defect register) ────────────
-- Seed A.3.1 used label_status 'unprocessed'/'to_inspect' which the app's UnitState
-- (pending|fixing|fixed|reinspect|signed_off) doesn't know → blank chips + a first
-- tap silently resets to pending (destroys the dispute trail). Normalise.
update progress_items set label_status = 'pending'
  where project_id = 'd0000004-0004-0004-0004-000000000004' and label_status = 'unprocessed';
update progress_items set label_status = 'reinspect'
  where project_id = 'd0000004-0004-0004-0004-000000000004' and label_status = 'to_inspect';

-- ── (3) Empty audit timelines on flagship docs ───────────────────────────────
-- The core promise (audit trail that survives disputes) shows BLANK on every locked
-- SI / approved VO / active PTW that the seeds inserted without approvals rows.
-- Generic backfill: for each such doc lacking approvals, insert one 'approve' per
-- chain step, actor = an approved project member holding that step's required_role.
insert into approvals (doc_type, doc_id, step_order, action_type, actor_id, reason, created_at)
select d.doc_type, d.doc_id, s.step_order, 'approve',
  (select pm.user_id from project_members pm
     where pm.project_id = d.project_id and pm.status = 'approved' and pm.role = s.required_role limit 1),
  null, now() - interval '3 days' + (s.step_order || ' hours')::interval
from (
  select 'si'::text doc_type, si.id doc_id, si.project_id, si.chain_snapshot
    from site_instructions si
    where si.project_id in ('d0000001-0001-0001-0001-000000000001','d0000002-0002-0002-0002-000000000002',
                            'd0000003-0003-0003-0003-000000000003','d0000004-0004-0004-0004-000000000004')
      and si.status = 'locked'
  union all
  select 'vo', vo.id, vo.project_id, vo.chain_snapshot
    from variation_orders vo
    where vo.project_id in ('d0000001-0001-0001-0001-000000000001','d0000002-0002-0002-0002-000000000002',
                            'd0000003-0003-0003-0003-000000000003','d0000004-0004-0004-0004-000000000004')
      and vo.status in ('approved','locked')
  union all
  select 'ptw', p.id, p.project_id, p.chain_snapshot
    from permits_to_work p
    where p.project_id in ('d0000001-0001-0001-0001-000000000001','d0000002-0002-0002-0002-000000000002',
                           'd0000003-0003-0003-0003-000000000003','d0000004-0004-0004-0004-000000000004')
      and p.status = 'active'
) d
cross join lateral jsonb_to_recordset(coalesce(d.chain_snapshot, '[]'::jsonb)) as s(step_order int, required_role text)
where not exists (select 1 from approvals a where a.doc_type = d.doc_type and a.doc_id = d.doc_id)
  and (select pm.user_id from project_members pm
         where pm.project_id = d.project_id and pm.status = 'approved' and pm.role = s.required_role limit 1) is not null;

commit;

-- Verify (execute):
--   select count(*) from progress_items where 'd0000001-..' = any(...) and assigned_to <> '{}';
--   select doc_type, count(*) from approvals where doc_id in (select id from site_instructions where status='locked' and project_id like 'd00000%') group by 1;
