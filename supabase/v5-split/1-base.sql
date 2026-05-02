create extension if not exists pg_net with schema extensions;

alter table user_profiles add column if not exists onesignal_id text;

create table if not exists app_config (
  id int primary key default 1,
  onesignal_app_id text,
  onesignal_rest_key text,
  constraint app_config_single_row check (id = 1)
);

insert into app_config (id) values (1) on conflict (id) do nothing;

alter table app_config enable row level security;
