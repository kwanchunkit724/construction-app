-- Refactor send_push_to_users to route by external_user_id (= Supabase user_id).
-- This means we don't need to save OneSignal player IDs in user_profiles.
-- The app just registers the device with external_user_id = supabase userid.

create or replace function send_push_to_users(
  p_user_ids uuid[],
  p_title text,
  p_body text,
  p_deep_link text default null
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $send_push$
declare
  v_app_id text;
  v_rest_key text;
  v_user_ids_text text[];
  v_payload jsonb;
begin
  select onesignal_app_id, onesignal_rest_key
    into v_app_id, v_rest_key
    from app_config where id = 1;

  if v_app_id is null or v_rest_key is null then
    raise log 'OneSignal credentials not configured.';
    return;
  end if;

  if p_user_ids is null or array_length(p_user_ids, 1) is null then
    return;
  end if;

  v_user_ids_text := array(select id::text from unnest(p_user_ids) as id);

  v_payload := jsonb_build_object(
    'app_id', v_app_id,
    'include_aliases', jsonb_build_object('external_id', v_user_ids_text),
    'target_channel', 'push',
    'headings', jsonb_build_object('en', p_title, 'zh-Hant', p_title),
    'contents', jsonb_build_object('en', p_body, 'zh-Hant', p_body),
    'ios_sound', 'default'
  );

  if p_deep_link is not null then
    v_payload := v_payload || jsonb_build_object(
      'data', jsonb_build_object('deep_link', p_deep_link)
    );
  end if;

  perform net.http_post(
    url := 'https://api.onesignal.com/notifications',
    body := v_payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Key ' || v_rest_key
    )
  );
exception when others then
  raise log 'send_push_to_users error: %', sqlerrm;
end;
$send_push$;
