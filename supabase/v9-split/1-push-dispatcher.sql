-- =============================================================
-- v9-split/1-push-dispatcher.sql — Push fan-out with fatigue cap
-- =============================================================
-- SECURITY DEFINER function. Atomically increments notification_counters
-- for (user, hkt_date). When count <= 3, fires pg_net.http_post to
-- OneSignal /notifications. When count > 3, appends payload to
-- notification_digest (drained at 08:00 HKT by 6-drain-digest-cron.sql).
--
-- Reuses Phase 0 app_config.onesignal_rest_key + onesignal_app_id.
-- Reuses Phase 0 include_aliases.external_id = user_id pattern.
-- Reuses Phase 1 device_type fix (FCM=1 Android, APNs=0 iOS — server
-- side, target_channel='push' handles routing).
--
-- Threat mitigation (T-02-07 DoS + T-02-PD tampering):
--   * 3/user/day hard cap prevents OneSignal Free-tier exhaustion
--   * revoke all from authenticated/anon — only invokable from
--     SECURITY DEFINER trigger paths (added in Plans 02-04 / 02-07)
-- =============================================================

create or replace function push_dispatcher(p_target uuid, p_payload jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Hong_Kong')::date;
  v_count int;
  v_rest_key text;
  v_app_id text;
begin
  -- Atomic upsert + read counter (race-safe under concurrent triggers)
  insert into notification_counters (user_id, hkt_date, count)
    values (p_target, v_today, 1)
    on conflict (user_id, hkt_date)
    do update set count = notification_counters.count + 1
    returning count into v_count;

  if v_count <= 3 then
    select onesignal_rest_key, onesignal_app_id
      into v_rest_key, v_app_id
      from app_config limit 1;
    perform net.http_post(
      url := 'https://api.onesignal.com/notifications',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Basic ' || v_rest_key
      ),
      body := jsonb_build_object(
        'app_id', v_app_id,
        'include_aliases', jsonb_build_object('external_id', jsonb_build_array(p_target::text)),
        'target_channel','push',
        'headings', jsonb_build_object(
          'zh-Hant', p_payload->>'heading_zh',
          'en',      coalesce(p_payload->>'heading_en','Notification')
        ),
        'contents', jsonb_build_object(
          'zh-Hant', p_payload->>'content_zh',
          'en',      coalesce(p_payload->>'content_en','')
        ),
        'data', jsonb_build_object('deep_link', p_payload->>'deep_link')
      )
    );
  else
    -- 4th+ notification → digest (drained 08:00 HKT)
    insert into notification_digest (user_id, hkt_date, items_jsonb)
      values (p_target, v_today, jsonb_build_array(p_payload))
      on conflict (user_id, hkt_date)
      do update set items_jsonb = notification_digest.items_jsonb || excluded.items_jsonb;
  end if;
end;
$$;

-- Server-only — only invokable by SECURITY DEFINER trigger paths.
revoke all on function push_dispatcher(uuid, jsonb) from authenticated, anon;

-- =============================================================
-- End of v9-split/1-push-dispatcher.sql
-- =============================================================
