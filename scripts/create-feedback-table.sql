-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Creates the demo_feedback table used by the in-app feedback modal

create table if not exists public.demo_feedback (
  id          uuid primary key default gen_random_uuid(),
  scenario    text not null,           -- 'short' | 'mid' | 'long' | 'general'
  user_id     uuid references auth.users on delete set null,
  username    text,
  user_name   text,
  role_zh     text,
  rating      int not null check (rating between 1 and 5),
  category    text not null,           -- '工作流程' | '功能缺失' | '介面設計' | '其他'
  message     text not null,
  created_at  timestamptz not null default now()
);

-- Index for quick reads in SuperAdmin panel
create index if not exists demo_feedback_created_at_idx on public.demo_feedback(created_at desc);
create index if not exists demo_feedback_scenario_idx   on public.demo_feedback(scenario);

-- Row Level Security
alter table public.demo_feedback enable row level security;

-- Anyone authenticated can insert their own feedback
create policy "authenticated users can submit feedback"
  on public.demo_feedback for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Only super-admin can read all feedback (anon key read blocked)
-- For simplicity we allow all authenticated users to read (SuperAdmin will display it)
create policy "authenticated users can read feedback"
  on public.demo_feedback for select
  to authenticated
  using (true);
