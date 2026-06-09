-- =============================================================
-- v28-vo-optional-si.sql — VO is a variation to the CONTRACT, not an edit of an SI
-- =============================================================
-- Domain fix (owner-reported): a 變更指令 (Variation Order) is the PRICED change
-- to the contract scope/sum that an instruction may cause — it is NOT "editing
-- the detail of" a 工地指令 (Site Instruction). Research (HKIS QSD PN06; HKIA/HKIS
-- Standard Form; Govt GCC) confirms:
--   * an SI/AI is a directive (cause); a VO is the priced effect.
--   * a variation need NOT have a single parent SI (CVI / drawing revision /
--     deemed variation / pre-agreed), and one SI can cause 0, 1, or MANY VOs.
--
-- The v9 model wrongly enforced strict 1-VO-per-SI and a mandatory locked parent
-- SI. This migration RELAXES those (additive only — backward compatible; no
-- column dropped, no NOT NULL added, no data rewritten; existing SI-linked VOs
-- keep working with the same locked-SI invariant):
--   1. drop UNIQUE(si_id)            → many VOs per SI allowed
--   2. si_id FK on-delete RESTRICT→SET NULL  (si_id is already nullable)
--   3. INSERT RLS: the locked-SI requirement applies ONLY when an SI is cited;
--      a standalone VO (si_id null) just needs project edit rights
--   4. submit_vo: the parent-SI lock check runs ONLY when si_id is set
-- =============================================================

-- 1. Drop the one-VO-per-SI uniqueness
alter table variation_orders drop constraint if exists variation_orders_si_id_key;
drop index if exists variation_orders_si_id_key;

-- 2. si_id FK: RESTRICT → SET NULL (deleting an SI orphans, not blocks, its VOs)
alter table variation_orders drop constraint if exists variation_orders_si_id_fkey;
alter table variation_orders
  add constraint variation_orders_si_id_fkey
  foreign key (si_id) references site_instructions(id) on delete set null;

-- 3. INSERT RLS — locked-SI gate only when an SI is cited; standalone allowed
drop policy if exists "Creator inserts draft VO" on variation_orders;
create policy "Creator inserts draft VO"
  on variation_orders for insert to authenticated
  with check (
    created_by = auth.uid()
    and status = 'draft'
    and chain_snapshot is null
    and (
      -- standalone VO: just needs project edit rights
      (si_id is null and can_edit_project_progress(auth.uid(), project_id))
      -- SI-linked VO: cited SI must be locked and in this project
      or exists (
        select 1 from site_instructions s
         where s.id = si_id
           and s.project_id = project_id
           and s.status = 'locked'
           and s.locked_at is not null
           and can_edit_project_progress(auth.uid(), s.project_id)
      )
    )
  );

-- 4. submit_vo — guard the SI-lock check so it only fires for SI-linked VOs
create or replace function submit_vo(p_vo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vo variation_orders%rowtype;
  v_si_locked timestamptz;
  v_snapshot jsonb;
  v_first_role text;
  v_first_optional uuid;
  v_holder uuid;
  v_payload jsonb;
  v_recipients uuid[];
begin
  select * into v_vo from variation_orders where id = p_vo_id for update;
  if not found then
    raise exception 'VO % not found', p_vo_id;
  end if;
  if v_vo.created_by <> auth.uid() then
    raise exception '只有提交人可以提交此變更指令';
  end if;
  if v_vo.status not in ('draft','revision_requested') then
    raise exception '變更指令不能從狀態 % 提交', v_vo.status;
  end if;

  -- VO-01: when this VO cites an SI, that SI must be locked. Standalone VOs skip.
  if v_vo.si_id is not null then
    select locked_at into v_si_locked from site_instructions where id = v_vo.si_id;
    if v_si_locked is null then
      raise exception '所引用的工地指令尚未鎖定 (VO-01)';
    end if;
  end if;

  select jsonb_agg(
           jsonb_build_object(
             'step_order', step_order,
             'required_role', required_role,
             'optional_user_id', optional_user_id
           ) order by step_order
         )
    into v_snapshot
    from approval_chain_steps
   where project_id = v_vo.project_id and doc_type = 'vo';

  if v_snapshot is null or jsonb_array_length(v_snapshot) = 0 then
    raise exception '此項目尚未配置變更指令審批鏈';
  end if;

  update variation_orders
     set chain_snapshot = v_snapshot,
         status = 'in_review',
         current_step = 0,
         submitted_at = coalesce(submitted_at, now())
   where id = p_vo_id;

  v_first_role := v_snapshot -> 0 ->> 'required_role';
  v_first_optional := nullif(v_snapshot -> 0 ->> 'optional_user_id', '')::uuid;

  v_payload := jsonb_build_object(
    'heading_zh', '新變更指令 ' || v_vo.number,
    'content_zh', '需要你批准',
    'deep_link',  '/project/' || v_vo.project_id::text || '/vo/' || v_vo.id::text
  );

  if v_first_optional is not null then
    v_recipients := array[v_first_optional];
  else
    v_recipients := array(select active_role_holders(v_vo.project_id, v_first_role));
  end if;

  foreach v_holder in array v_recipients loop
    perform push_dispatcher(v_holder, v_payload);
  end loop;
end;
$$;

grant execute on function submit_vo(uuid) to authenticated;
