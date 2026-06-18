-- =============================================================
-- v91-controlled-docs-schema.sql   (受控文件登記冊 — Controlled-Document Register)
-- =============================================================
-- A formal register of CONTROLLED documents (drawings / specs / method statements
-- / procedures / forms / manuals) — the control layer above the file store: each
-- entry tracks its revision, controlled status (current / superseded / withdrawn),
-- controlled-copy holders, and the issuing officer. Revision control is a
-- supersede: issuing a new revision inserts a fresh 'current' row (same number)
-- and marks the prior row 'superseded', so the register shows the full revision
-- trail. Mirrors the RISC/NCR module shape with the review lessons baked in
-- (BEFORE INSERT guard on the privileged `status`; module-gated UPDATE; the
-- supersede/withdraw transitions are SECURITY DEFINER RPCs). Additive. zh-HK. ASI.
-- =============================================================

create table if not exists controlled_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  number text not null,                              -- CD-001 (stable across revisions)
  title text not null,
  doc_category text not null default 'other'
    check (doc_category in ('drawing','spec','method_statement','procedure','form','manual','other')),
  revision text not null default 'A',                -- e.g. A / B / 01
  status text not null default 'current'
    check (status in ('current','superseded','withdrawn')),
  holders text,                                      -- controlled-copy holders / distribution
  notes text,
  issued_by uuid not null references user_profiles(id) on delete restrict,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_cd_project_status on controlled_documents (project_id, status, number);

create or replace function public.touch_cd_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_cd_touch on controlled_documents;
create trigger trg_cd_touch before update on controlled_documents
  for each row execute function public.touch_cd_updated_at();

-- BEFORE INSERT guard (review lesson): a client insert always starts 'current';
-- only revise_cd/withdraw_cd (SECURITY DEFINER) set superseded/withdrawn.
create or replace function public.guard_cd_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then new.status := 'current'; end if;
  return new;
end;
$$;
drop trigger if exists trg_cd_guard_insert on controlled_documents;
create trigger trg_cd_guard_insert before insert on controlled_documents
  for each row execute function public.guard_cd_insert();

alter table controlled_documents enable row level security;

drop policy if exists cd_select on controlled_documents;
create policy cd_select on controlled_documents for select to authenticated
  using (can_view_project(auth.uid(), project_id) and project_module_enabled(project_id, 'controlled_docs'));

drop policy if exists cd_insert on controlled_documents;
create policy cd_insert on controlled_documents for insert to authenticated
  with check (
    issued_by = auth.uid()
    and can_edit_project_progress(auth.uid(), project_id)
    and project_module_enabled(project_id, 'controlled_docs')
  );

-- UPDATE: issuer may edit descriptive fields WHILE 'current'; admin always.
-- Module-gated. Status transitions go through the RPCs (SECURITY DEFINER).
drop policy if exists cd_update on controlled_documents;
create policy cd_update on controlled_documents for update to authenticated
  using (
    ((issued_by = auth.uid() and status = 'current')
      or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin'))
    and project_module_enabled(project_id, 'controlled_docs')
  )
  with check (
    ((issued_by = auth.uid() and status = 'current')
      or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin'))
    and project_module_enabled(project_id, 'controlled_docs')
  );

drop policy if exists cd_delete on controlled_documents;
create policy cd_delete on controlled_documents for delete to authenticated
  using (
    (issued_by = auth.uid() and status = 'current')
    or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
  );

create or replace function public.next_cd_number(p_project_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_seq_name text := 'cd_seq_' || replace(p_project_id::text, '-', '_');
  v_next bigint;
begin
  execute format('create sequence if not exists %I minvalue 1 start 1', v_seq_name);
  execute format('select nextval(%L)', v_seq_name) into v_next;
  return 'CD-' || lpad(v_next::text, 3, '0');
end;
$$;
grant execute on function public.next_cd_number(uuid) to authenticated;

-- Issue a new revision: supersede the current row, insert a fresh 'current' row
-- carrying the same number/title/category/holders. Gate = editor.
create or replace function public.revise_cd(p_id uuid, p_revision text, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_row controlled_documents%rowtype; v_uid uuid := auth.uid(); v_new uuid;
begin
  if v_uid is null then raise exception '未登入'; end if;
  if coalesce(trim(p_revision), '') = '' then raise exception '請輸入版本'; end if;
  select * into v_row from controlled_documents where id = p_id;
  if v_row.id is null then raise exception '找不到受控文件'; end if;
  if not can_edit_project_progress(v_uid, v_row.project_id) then raise exception '沒有權限發出新版本'; end if;
  if v_row.status <> 'current' then raise exception '只可以從生效版本發出新版本'; end if;
  update controlled_documents set status = 'superseded' where id = p_id;
  insert into controlled_documents (project_id, number, title, doc_category, revision, status, holders, notes, issued_by)
  values (v_row.project_id, v_row.number, v_row.title, v_row.doc_category, p_revision, 'current', v_row.holders, p_note, v_uid)
  returning id into v_new;
  return v_new;
end;
$$;
grant execute on function public.revise_cd(uuid, text, text) to authenticated;

-- Withdraw a controlled document (admin / assigned PM / approved pm|main_contractor).
create or replace function public.withdraw_cd(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_project uuid; v_status text; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception '未登入'; end if;
  select project_id, status into v_project, v_status from controlled_documents where id = p_id;
  if v_project is null then raise exception '找不到受控文件'; end if;
  if not (
    exists (select 1 from user_profiles where id = v_uid and global_role = 'admin')
    or exists (select 1 from projects where id = v_project and v_uid = any(assigned_pm_ids))
    or exists (select 1 from project_members where project_id = v_project and user_id = v_uid
               and status = 'approved' and role in ('pm','main_contractor'))
  ) then
    raise exception '只有管理員 / PM / 總承建商可以撤回受控文件';
  end if;
  if v_status = 'withdrawn' then return; end if;
  update controlled_documents set status = 'withdrawn' where id = p_id;
end;
$$;
grant execute on function public.withdraw_cd(uuid) to authenticated;

create or replace function public.get_project_modules(p_project_id uuid)
returns table (module_key text, enabled boolean)
language sql security definer stable set search_path = public as $$
  select k.module_key, coalesce(pm.enabled, true) as enabled
  from (values
    ('progress'),('issues'),('si'),('vo'),('ptw'),('weather'),('documents'),
    ('materials'),('contacts'),('timetable'),('dailies'),('equipment'),('assistant'),
    ('cleansing'),('ncr'),('risc'),('labour'),('controlled_docs')
  ) as k(module_key)
  left join project_modules pm
    on pm.project_id = p_project_id and pm.module_key = k.module_key;
$$;
grant execute on function public.get_project_modules(uuid) to authenticated;

-- =============================================================
-- Post-apply verification (execute, not source):
--   select to_regclass('public.controlled_documents') is not null;          -> t
--   select count(*) = 18 from get_project_modules('<project-id>'::uuid);     -> t
--   select next_cd_number('<project-id>'::uuid);                            -> 'CD-001'
--   select count(*) from pg_policies where tablename='controlled_documents'; -> 4
--   select count(*) from pg_trigger where tgname in ('trg_cd_touch','trg_cd_guard_insert'); -> 2
--   select count(*) from pg_proc where proname in ('next_cd_number','revise_cd','withdraw_cd'); -> 3
-- =============================================================
