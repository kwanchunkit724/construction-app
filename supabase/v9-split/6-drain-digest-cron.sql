-- =============================================================
-- v9-split/6-drain-digest-cron.sql — 08:00 HKT digest drain
-- =============================================================
-- 0 0 UTC == 08:00 Asia/Hong_Kong (HK has no DST).
-- Sends ONE aggregated OneSignal push per user covering all
-- 4th-and-beyond notifications from the previous HKT day.
--
-- Function is server-only (revoked from authenticated/anon).
-- pg_cron schedule is idempotent (unschedule-if-exists pattern).
-- =============================================================

create extension if not exists pg_cron with schema extensions;

create or replace function drain_notification_digest()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_row record;
  v_rest_key text;
  v_app_id text;
begin
  select onesignal_rest_key, onesignal_app_id into v_rest_key, v_app_id
    from app_config limit 1;

  for v_row in
    select id, user_id, items_jsonb
      from notification_digest
     where sent_at is null
       and hkt_date <= current_date
  loop
    perform net.http_post(
      url := 'https://api.onesignal.com/notifications',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Basic ' || v_rest_key
      ),
      body := jsonb_build_object(
        'app_id', v_app_id,
        'include_aliases', jsonb_build_object('external_id', jsonb_build_array(v_row.user_id::text)),
        'target_channel','push',
        'headings', jsonb_build_object(
          'zh-Hant','你今日有 ' || jsonb_array_length(v_row.items_jsonb) || ' 則簽核通知',
          'en','You have notifications'
        ),
        'contents', jsonb_build_object(
          'zh-Hant','點擊查看詳情',
          'en','Tap to review'
        ),
        'data', jsonb_build_object('deep_link','/home')
      )
    );
    update notification_digest set sent_at = now() where id = v_row.id;
  end loop;
end;
$$;

revoke all on function drain_notification_digest() from authenticated, anon;

-- Idempotent schedule: unschedule existing 'si-vo-digest' job (if any),
-- then create afresh at 0 0 UTC (= 08:00 Asia/Hong_Kong, no DST).
do $$
begin
  perform cron.unschedule('si-vo-digest');
exception when others then null;
end $$;

-- 0 0 UTC == 08:00 Asia/Hong_Kong
select cron.schedule(
  'si-vo-digest',
  '0 0 * * *',
  $cron$ select drain_notification_digest(); $cron$
);

-- =============================================================
-- End of v9-split/6-drain-digest-cron.sql
-- Post-apply verification:
--   select jobname, schedule from cron.job where jobname='si-vo-digest';
-- =============================================================
