-- =============================================================
-- seed-fixes-v2.sql — demo-data soundness fixes for the 4 [DEMO] projects
-- =============================================================
-- Supersedes seed-fixes.sql. Fixes the "blank audit trail" + credential +
-- unit_status demo bugs surfaced by SIMULATION-REPORT.md, but corrects the
-- TWO real defects in the v1 file (verified against the LIVE schema):
--
--   * v1 (d) compared progress_items.label_status = 'unprocessed' / 'to_inspect'.
--     label_status is a jsonb OBJECT (a per-unit { "12/F-D":"unprocessed", ... }
--     map, v44), NOT a scalar — that comparison ERRORS at runtime and never ran.
--     v2 rewrites the bad values INSIDE the object via jsonb_object_agg.
--   * v1 (3) PTW branch joined on permits_to_work.chain_snapshot, but ACTIVE
--     permits carry chain_snapshot = NULL (v10: it is frozen only while in_review,
--     then activate_ptw locks the row). So the v1 PTW lateral produced ZERO rows
--     and 簽核紀錄 stayed blank. PTW audit lives in permit_signoffs (sidecar to
--     approvals), NOT in the generic approvals-by-chain_snapshot path — v2 (b)
--     reconstructs the PTW chain from approval_chain_steps (doc_type='ptw') and
--     writes approvals + permit_signoffs the way record_ptw_signoff would.
--
-- Personas resolve BY PHONE. The 4 demo projects:
--   d0000001-0001-0001-0001-000000000001  d0000002-0002-0002-0002-000000000002
--   d0000003-0003-0003-0003-000000000003  d0000004-0004-0004-0004-000000000004
--
-- Idempotent: every insert is guarded (NOT EXISTS / ON CONFLICT) and the
-- credential-verify trigger toggle is symmetric. Safe to re-run.
-- Verification footer at the bottom (execute, not source).
-- =============================================================

begin;

-- ── (a) APPROVALS — backfill blank audit trails on SI + VO ────────────────────
-- The core promise (an audit trail that survives disputes) renders BLANK on every
-- locked SI / approved-or-locked VO that the seeds inserted with ZERO approvals.
-- For each such doc lacking ANY approval, insert one 'approve' per chain step
-- (chain_snapshot is a jsonb ARRAY of {step_order,required_role,optional_user_id}),
-- actor = an approved project_members.user_id holding that step's required_role.
-- Steps whose role has no member (e.g. an 'owner' step on a project with no owner
-- member) are SKIPPED — better a partial-but-truthful trail than a fabricated one.
-- action_type = 'approve' (no reason needed; the CHECK only requires reason>=10
-- for request_revision/reject/admin_override). step_order mirrors submit_approval:
-- it equals the chain array index, which equals s.step_order in the snapshot.
-- PTW is deliberately EXCLUDED here (active PTW chain_snapshot is NULL — handled
-- in (b) via approval_chain_steps + permit_signoffs).
insert into approvals (doc_type, doc_id, step_order, action_type, actor_id, reason, created_at)
select d.doc_type, d.doc_id, s.step_order, 'approve'::approval_action_type,
       holder.user_id,
       null,
       now() - interval '3 days' + (s.step_order || ' hours')::interval
from (
  select 'si'::text as doc_type, si.id as doc_id, si.project_id, si.chain_snapshot
    from site_instructions si
   where si.project_id in (
           'd0000001-0001-0001-0001-000000000001','d0000002-0002-0002-0002-000000000002',
           'd0000003-0003-0003-0003-000000000003','d0000004-0004-0004-0004-000000000004')
     and si.status = 'locked'
  union all
  select 'vo'::text, vo.id, vo.project_id, vo.chain_snapshot
    from variation_orders vo
   where vo.project_id in (
           'd0000001-0001-0001-0001-000000000001','d0000002-0002-0002-0002-000000000002',
           'd0000003-0003-0003-0003-000000000003','d0000004-0004-0004-0004-000000000004')
     and vo.status in ('approved','locked')
) d
cross join lateral jsonb_to_recordset(coalesce(d.chain_snapshot, '[]'::jsonb))
  as s(step_order int, required_role text)
cross join lateral (
  select pm.user_id
    from project_members pm
   where pm.project_id = d.project_id
     and pm.status = 'approved'
     and pm.role = s.required_role
   order by pm.user_id
   limit 1
) as holder
where holder.user_id is not null
  and not exists (
    select 1 from approvals a
     where a.doc_type = d.doc_type and a.doc_id = d.doc_id
  );

-- ── (b) PERMIT_SIGNOFFS — populate PtwDetail 簽核紀錄 for active permits ───────
-- Active permits_to_work have chain_snapshot = NULL, so (a)'s generic path can't
-- reach them. The canonical PTW chain is approval_chain_steps (doc_type='ptw'),
-- normally [step0 safety_officer, step1 main_contractor]. record_ptw_signoff
-- writes ONE permit_signoffs row per approval (keyed UNIQUE by approval_id), and
-- a signoff REQUIRES its parent approvals row. So per active permit lacking any
-- signoff we: (1) insert one 'approve' per configured chain step, actor = the
-- role-holder member; (2) insert the permit_signoffs sidecar for each, mirroring
-- what record_ptw_signoff persists (approval_id + ptw_id + signature_b64).
-- signature_b64 must be >=100 chars for the real RPC's guard — use a placeholder
-- long enough to read as a valid demo signature blob.

-- (b.1) the approval rows (one per ptw chain step), guarded by NOT EXISTS.
insert into approvals (doc_type, doc_id, step_order, action_type, actor_id, reason, created_at)
select 'ptw'::text, p.id, st.step_order, 'approve'::approval_action_type,
       holder.user_id,
       null,
       coalesce(p.activated_at, p.submitted_at, now())
         - interval '2 hours' + (st.step_order || ' minutes')::interval * 30
from permits_to_work p
join approval_chain_steps st
  on st.project_id = p.project_id and st.doc_type = 'ptw'
cross join lateral (
  select pm.user_id
    from project_members pm
   where pm.project_id = p.project_id
     and pm.status = 'approved'
     and pm.role = st.required_role
   order by pm.user_id
   limit 1
) as holder
where p.project_id in (
        'd0000001-0001-0001-0001-000000000001','d0000002-0002-0002-0002-000000000002',
        'd0000003-0003-0003-0003-000000000003','d0000004-0004-0004-0004-000000000004')
  and p.status = 'active'
  and holder.user_id is not null
  and not exists (
    select 1 from approvals a
     where a.doc_type = 'ptw' and a.doc_id = p.id and a.step_order = st.step_order
  );

-- (b.2) the permit_signoffs sidecar — one per ptw approval that lacks a signoff.
-- approval_id is UNIQUE, so the NOT EXISTS guard also makes this idempotent.
insert into permit_signoffs (approval_id, ptw_id, signature_b64, created_at)
select a.id, a.doc_id,
       'data:image/png;base64,'
         || repeat('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg', 4),
       a.created_at
from approvals a
join permits_to_work p
  on p.id = a.doc_id
where a.doc_type = 'ptw'
  and p.project_id in (
        'd0000001-0001-0001-0001-000000000001','d0000002-0002-0002-0002-000000000002',
        'd0000003-0003-0003-0003-000000000003','d0000004-0004-0004-0004-000000000004')
  and p.status = 'active'
  and not exists (
    select 1 from permit_signoffs s where s.approval_id = a.id
  );

-- ── (c) CREDENTIAL + FORM_SIGNOFFS — verified 合資格人員 for safety_officer 60000004 ─
-- record_form_signoff refuses unless the signer holds a VERIFIED, in-date
-- credential whose credential_type = template.required_credential. The seed
-- safety_officer (phone 60000004) has none, so the 法定表格簽署 demo dead-ends.
-- Insert a verified competent_person credential. The guard_credential_verify
-- BEFORE-UPDATE trigger (trg_guard_credential_verify) pins verified_by/at to
-- their OLD values on any non-sanctioned write — and it does NOT fire on INSERT,
-- but the sanctioned bypass is the cleanest, self-documenting way to land a row
-- that already reads as verified. We disable the named trigger for these two
-- statements, then re-enable it (symmetric, inside the txn).
alter table user_credentials disable trigger trg_guard_credential_verify;

insert into user_credentials
  (user_id, credential_type, cert_name_zh, cert_no, issuer, valid_from, valid_until,
   verified_by, verified_at)
select so.id, 'competent_person', '合資格人員證書 (棚架/機械)', 'CP-DEMO-60000004',
       '勞工處', current_date - interval '60 days', current_date + interval '365 days',
       so.id, now()
from user_profiles so
where so.phone = '60000004'
  and not exists (
    select 1 from user_credentials c
     where c.user_id = so.id and c.credential_type = 'competent_person'
  );

alter table user_credentials enable trigger trg_guard_credential_verify;

-- (c.2) optional: seed a couple of PASS form_signoffs on existing form_instances
-- in the demo projects so the 機械/表格 register shows a populated history. Signed
-- by the now-credentialed safety_officer (60000004); credential_snapshot mirrors
-- what record_form_signoff captures. Guarded so re-runs don't pile up rows.
insert into form_signoffs
  (instance_id, project_id, result, payload, signed_by, signed_at, valid_until,
   signature_b64, credential_id, credential_snapshot)
select fi.id, fi.project_id, 'pass',
       jsonb_build_object('note', '[demo] 週期檢查合格', 'checklist', '{}'::jsonb),
       so.id, now() - interval '1 day',
       case when ft.frequency_days is not null
            then now() + (ft.frequency_days || ' days')::interval else null end,
       'data:image/png;base64,'
         || repeat('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg', 4),
       cred.id,
       jsonb_build_object('type', cred.credential_type, 'cert_no', cred.cert_no,
                          'valid_until', cred.valid_until)
from form_instances fi
join form_templates ft on ft.id = fi.template_id
cross join lateral (
  select id from user_profiles where phone = '60000004' limit 1
) as so
cross join lateral (
  select c.id, c.credential_type, c.cert_no, c.valid_until
    from user_credentials c
   where c.user_id = so.id
     and c.credential_type = ft.required_credential
     and c.verified_at is not null
   order by c.valid_until desc nulls last
   limit 1
) as cred
where fi.project_id in (
        'd0000001-0001-0001-0001-000000000001','d0000002-0002-0002-0002-000000000002',
        'd0000003-0003-0003-0003-000000000003','d0000004-0004-0004-0004-000000000004')
  and cred.id is not null
  and not exists (
    select 1 from form_signoffs s where s.instance_id = fi.id
  );

-- keep form_instances.valid_until / last_signoff_id consistent with the seeded
-- pass signoff (what record_form_signoff would have done).
update form_instances fi
   set last_signoff_id = s.id,
       valid_until     = s.valid_until,
       suspended       = false
from form_signoffs s
where s.instance_id = fi.id
  and fi.last_signoff_id is distinct from s.id
  and fi.project_id in (
        'd0000001-0001-0001-0001-000000000001','d0000002-0002-0002-0002-000000000002',
        'd0000003-0003-0003-0003-000000000003','d0000004-0004-0004-0004-000000000004');

-- ── (d) UNIT_STATUS — normalise legacy values INSIDE the label_status object ───
-- progress_items.label_status is a jsonb OBJECT (per-unit map). ~2 rows in
-- d0000004 still hold the legacy UnitState values 'unprocessed'/'to_inspect'
-- which the app's UnitState (pending|fixing|fixed|reinspect|signed_off) doesn't
-- know — they render as blank chips and a first tap silently resets to pending,
-- destroying the dispute trail. Rewrite each bad VALUE inside the object:
--   'unprocessed' -> 'pending'    'to_inspect' -> 'reinspect'
-- Test on jsonb VALUES correctly: compare each value to to_jsonb('...'::text)
-- (never label_status = 'unprocessed', which errors on an object).
update progress_items pi
   set label_status = (
     select jsonb_object_agg(
              e.k,
              case
                when e.v = to_jsonb('unprocessed'::text) then to_jsonb('pending'::text)
                when e.v = to_jsonb('to_inspect'::text)  then to_jsonb('reinspect'::text)
                else e.v
              end)
       from jsonb_each(pi.label_status) as e(k, v)
   )
 where pi.project_id = 'd0000004-0004-0004-0004-000000000004'
   and jsonb_typeof(pi.label_status) = 'object'
   and exists (
     select 1 from jsonb_each(pi.label_status) as e(k, v)
      where e.v in (to_jsonb('unprocessed'::text), to_jsonb('to_inspect'::text))
   );

commit;

-- =============================================================
-- Verification (execute, not source — run after COMMIT):
--
-- (a) every locked SI / approved|locked VO in the demo projects now has approvals:
--   select 'si' k, count(*) total,
--          count(*) filter (where exists (select 1 from approvals a
--             where a.doc_type='si' and a.doc_id=si.id)) with_audit
--     from site_instructions si
--    where si.status='locked'
--      and si.project_id::text like 'd000000%'
--   union all
--   select 'vo', count(*),
--          count(*) filter (where exists (select 1 from approvals a
--             where a.doc_type='vo' and a.doc_id=vo.id))
--     from variation_orders vo
--    where vo.status in ('approved','locked')
--      and vo.project_id::text like 'd000000%';
--   -- expect with_audit = total for both (modulo docs whose chain rolesall lack members).
--
-- (b) active permits now have a populated 簽核紀錄:
--   select p.number, count(s.id) signoffs
--     from permits_to_work p
--     left join permit_signoffs s on s.ptw_id = p.id
--    where p.status='active' and p.project_id::text like 'd000000%'
--    group by p.number order by p.number;   -- expect >=1 per active permit
--   -- and each signoff has its parent approval:
--   select count(*) from permit_signoffs s
--     join approvals a on a.id = s.approval_id where a.doc_type='ptw';  -- > 0
--
-- (c) the safety officer's credential reads as verified + in-date:
--   select c.credential_type, c.cert_no, c.valid_until,
--          c.verified_by is not null as is_verified
--     from user_credentials c
--     join user_profiles u on u.id = c.user_id
--    where u.phone='60000004';   -- expect competent_person, is_verified=t, valid_until future
--   -- the verify guard is back ON:
--   select tgenabled from pg_trigger
--    where tgname='trg_guard_credential_verify'
--      and tgrelid='user_credentials'::regclass;   -- expect 'O' (enabled)
--
-- (d) no demo progress_items label_status still holds a legacy value:
--   select id, code, label_status
--     from progress_items
--    where project_id='d0000004-0004-0004-0004-000000000004'
--      and jsonb_typeof(label_status)='object'
--      and exists (select 1 from jsonb_each(label_status) e(k,v)
--                   where e.v in (to_jsonb('unprocessed'::text), to_jsonb('to_inspect'::text)));
--   -- expect ZERO rows.
-- =============================================================
