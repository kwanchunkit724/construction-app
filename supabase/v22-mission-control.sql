-- ============================================================
-- v22-mission-control.sql
-- ============================================================
-- Sales mission control panel backing store.
-- Three tables: mission_tasks, mission_log, mission_metrics.
-- RLS: public read (anon + authenticated), admin-only write.
--
-- Apply via Supabase Dashboard SQL Editor (one-shot paste).
-- Idempotent — safe to re-run.
-- ============================================================

-- ── mission_tasks ───────────────────────────────────────────
create table if not exists mission_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  status text not null default 'pending' check (status in ('pending','in_progress','completed','blocked')),
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  category text not null default 'outreach' check (category in ('outreach','demo','pilot','product','infra','admin','content')),
  owner text not null default 'user' check (owner in ('user','agent','both')),
  due_date date,
  notes text default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mission_tasks_status_idx on mission_tasks(status);
create index if not exists mission_tasks_priority_idx on mission_tasks(priority);
create index if not exists mission_tasks_sort_idx on mission_tasks(sort_order, created_at desc);

alter table mission_tasks enable row level security;

drop policy if exists "mission_tasks public read" on mission_tasks;
create policy "mission_tasks public read" on mission_tasks
  for select using (true);

drop policy if exists "mission_tasks admin write" on mission_tasks;
create policy "mission_tasks admin write" on mission_tasks
  for all using (
    auth.uid() is not null and exists (
      select 1 from user_profiles where id = auth.uid() and global_role = 'admin'
    )
  ) with check (
    auth.uid() is not null and exists (
      select 1 from user_profiles where id = auth.uid() and global_role = 'admin'
    )
  );

-- updated_at trigger
create or replace function set_mission_tasks_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists mission_tasks_updated_at on mission_tasks;
create trigger mission_tasks_updated_at
  before update on mission_tasks
  for each row execute function set_mission_tasks_updated_at();

-- ── mission_log ─────────────────────────────────────────────
create table if not exists mission_log (
  id uuid primary key default gen_random_uuid(),
  author text not null check (author in ('user','agent','system')),
  body text not null,
  tags text[] default '{}',
  created_at timestamptz not null default now()
);

create index if not exists mission_log_created_at_idx on mission_log(created_at desc);

alter table mission_log enable row level security;

drop policy if exists "mission_log public read" on mission_log;
create policy "mission_log public read" on mission_log
  for select using (true);

drop policy if exists "mission_log admin insert" on mission_log;
create policy "mission_log admin insert" on mission_log
  for insert with check (
    auth.uid() is not null and exists (
      select 1 from user_profiles where id = auth.uid() and global_role = 'admin'
    )
  );

-- ── mission_metrics ─────────────────────────────────────────
-- Single-row config table. id = 'current' always.
create table if not exists mission_metrics (
  id text primary key default 'current',
  mrr_hkd int not null default 0,
  customers_signed int not null default 0,
  pilots_active int not null default 0,
  demos_run int not null default 0,
  outreach_sent int not null default 0,
  replies_received int not null default 0,
  current_focus text default '',
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 'current')
);

alter table mission_metrics enable row level security;

drop policy if exists "mission_metrics public read" on mission_metrics;
create policy "mission_metrics public read" on mission_metrics
  for select using (true);

drop policy if exists "mission_metrics admin write" on mission_metrics;
create policy "mission_metrics admin write" on mission_metrics
  for all using (
    auth.uid() is not null and exists (
      select 1 from user_profiles where id = auth.uid() and global_role = 'admin'
    )
  ) with check (
    auth.uid() is not null and exists (
      select 1 from user_profiles where id = auth.uid() and global_role = 'admin'
    )
  );

-- Seed single metrics row
insert into mission_metrics (id, current_focus)
values ('current', 'Wait Android 14-day clock (~2026-06-10). Sales kit ready. Pre-launch checklist pending — see /mission Tasks tab.')
on conflict (id) do nothing;

-- Seed initial tasks mirroring task tracker #50-#55
insert into mission_tasks (title, description, status, priority, category, owner, sort_order) values
  ('Pre-launch: print pricing + objections, set up CRM, polish LinkedIn',
   'Print 06-PRICING + 07-OBJECTIONS on 80gsm. Build target spreadsheet (columns from 08-FOLLOWUP-FRAMEWORK). LinkedIn profile title + about + banner refresh.',
   'pending', 'high', 'admin', 'user', 10),
  ('Sales Day 1: send 5 cold LinkedIn DMs + 2 WhatsApps',
   'First outreach per 09-30-DAY-LAUNCH-PLAN.md. Script 1 (LinkedIn) + Script 3 (WhatsApp). Personalize each by 1 detail. Tue/Wed PM HKT optimal.',
   'pending', 'urgent', 'outreach', 'user', 20),
  ('Record 60-sec demo video on iPhone (Loom)',
   'Login as 60001005 何判頭 → daily flow → 急件 toggle → switch to PM view → show 4 zones. zh-HK narration. Upload to Loom free tier.',
   'pending', 'high', 'content', 'user', 30),
  ('Build /sell landing page on Vercel',
   'Path: lime-six.vercel.app/sell. Above fold: positioning one-liner + iPhone hero. Sections: Pain, Solution, Pricing, Sign-up CTA.',
   'pending', 'medium', 'product', 'agent', 40),
  ('Build 1-page A4 PDF takeaway from 06 pricing',
   'Top half: pricing table. Bottom half: ROI math + contact. 80gsm print quality. Bring 10 copies to any in-person meeting.',
   'pending', 'medium', 'content', 'agent', 50),
  ('Apply Google Play production-access questionnaire (~2026-06-10)',
   'Once Android closed-alpha 14-day clock completes, apply for Google production-access. Questionnaire about closed test results. Wait Google review ~7 days.',
   'pending', 'medium', 'infra', 'user', 60)
on conflict do nothing;

-- Seed initial log message
insert into mission_log (author, body, tags) values
  ('system', 'Mission control panel created. Public URL: https://construction-app-lime-six.vercel.app/#/mission. Public-read, admin-write (login as kck980724 admin to post).', array['boot','meta']);
