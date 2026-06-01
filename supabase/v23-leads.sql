-- ============================================================
-- v23-leads.sql
-- ============================================================
-- Sales lead capture from the public /sell landing page.
-- Anyone (anon) can submit a lead; only admins can read/manage them.
-- Surfaced in /#/mission → Leads tab.
--
-- Apply via Supabase Dashboard SQL Editor (one-shot paste).
-- Idempotent — safe to re-run.
-- ============================================================

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text default '',
  contact text not null,          -- phone / email / WhatsApp, freeform
  message text default '',
  source text not null default 'sell',
  status text not null default 'new' check (status in ('new','contacted','demo','pilot','won','lost')),
  notes text default '',
  created_at timestamptz not null default now()
);

create index if not exists leads_created_idx on leads(created_at desc);
create index if not exists leads_status_idx on leads(status);

alter table leads enable row level security;

-- Public submit: anon + authenticated can INSERT a lead from the sell page.
-- (No SELECT for anon — submitters can't read the table back.)
drop policy if exists "leads public insert" on leads;
create policy "leads public insert" on leads
  for insert with check (true);

-- Admin-only read.
drop policy if exists "leads admin read" on leads;
create policy "leads admin read" on leads
  for select using (
    auth.uid() is not null and exists (
      select 1 from user_profiles where id = auth.uid() and global_role = 'admin'
    )
  );

-- Admin-only status/notes updates.
drop policy if exists "leads admin update" on leads;
create policy "leads admin update" on leads
  for update using (
    auth.uid() is not null and exists (
      select 1 from user_profiles where id = auth.uid() and global_role = 'admin'
    )
  ) with check (
    auth.uid() is not null and exists (
      select 1 from user_profiles where id = auth.uid() and global_role = 'admin'
    )
  );

-- Admin-only delete.
drop policy if exists "leads admin delete" on leads;
create policy "leads admin delete" on leads
  for delete using (
    auth.uid() is not null and exists (
      select 1 from user_profiles where id = auth.uid() and global_role = 'admin'
    )
  );
