-- =============================================================
-- v9-account-deletion-extend.sql
-- =============================================================
-- Extends v6 RPC delete_my_account(). Adds an in_flight_approvals()
-- pre-check; PRESERVES the original cascade-delete behaviour for
-- users with zero in-flight items (Apple Guideline 5.1.1(v)
-- compliance — already passed App Store review, must not regress).
--
-- NON-DESTRUCTIVE: replaces the function body only; no data touched.
--
-- Behaviour summary:
--   * not authenticated → {ok:false, error:'未登入'}
--   * pending > 0       → {ok:false, blocked:true, pending:N,
--                          error:'你尚有 N 項待處理嘅簽核工作...'}
--   * pending = 0       → preserved v6 cascade (delete auth.users)
--                       → {ok:true}
--
-- Return type changed from void → json. Callers in src/lib/* must
-- read the .ok / .blocked fields. Document this in Plan 02-09
-- regression test.
-- =============================================================

create or replace function public.delete_my_account()
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pending int;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '未登入');
  end if;

  -- ── In-flight approval guard (CHN-09 / T-02-06) ────────────
  v_pending := in_flight_approvals(v_uid);
  if v_pending > 0 then
    return json_build_object(
      'ok', false,
      'blocked', true,
      'pending', v_pending,
      'error', '你尚有 ' || v_pending || ' 項待處理嘅簽核工作，需要管理員重新分派後先可以刪除帳戶。'
    );
  end if;

  -- BEGIN: preserved verbatim from v6-account-deletion.sql
  -- Apple compliance: this path is unchanged from v6. The new
  -- in_flight_approvals guard above returns BEFORE this path runs
  -- only when the user has pending approvals; users with zero
  -- pending approvals still delete successfully and return {ok:true}.
  --
  -- Delete the auth user. ON DELETE CASCADE on user_profiles.id
  -- removes the profile and all dependents (project_members, etc.)
  -- Authored content FKs were loosened in v6 (set null on delete)
  -- so projects.created_by + project_members.approved_by become NULL.
  delete from auth.users where id = v_uid;
  -- END: preserved verbatim from v6

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'v9 extension of v6 RPC. Returns json. Blocks delete when in_flight_approvals(caller) > 0 with zh-HK error message; otherwise preserves v6 cascade (auth.users delete + dependent cascades). Apple Guideline 5.1.1(v) compliance preserved for users with zero pending approvals.';

-- =============================================================
-- End of v9-account-deletion-extend.sql
-- Post-apply verification:
--   select prosrc from pg_proc where proname='delete_my_account';
--     -- output must contain "in_flight_approvals" substring
--   select pg_get_function_result(oid)
--     from pg_proc where proname='delete_my_account';
--     -- must be "json"
-- =============================================================
