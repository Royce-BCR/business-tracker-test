-- =====================================================================================================
-- STAGE S, STEP 2 OF 2:  auth-stage-b.sql  (THE LOCKDOWN: anyone who is not a signed-in, approved member is refused)
-- Written for the Business Tracker. NOT RUN by Claude: Royce's assistant reviews and applies it once in Supabase > SQL Editor.
-- Idempotent (safe to run twice).
--
-- ORDER AND RISK  (read before running)
--   * Run auth-stage-a.sql first, deploy the new portal, and make sure EVERY member (Royce, Lynton, Gerry, Mike, Peter) has signed in
--     once with the new portal. The OLD portal (and any browser still on it) stops working the moment this file runs: it talks as anon.
--   * If anything goes wrong, the ROLLBACK section at the bottom restores the open anon access with one paste.
--   * Before running, save the output of the "RECORD THE CURRENT STATE" queries below, so the rollback can be checked against it.
--
-- RECORD THE CURRENT STATE FIRST (run these, keep the results; they are read-only)
--   select tablename, policyname, roles, cmd, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2;
--   select grantee, table_name, string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants
--     where table_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC') group by 1, 2 order by 2, 1;
--   select p.oid::regprocedure, has_function_privilege('anon', p.oid, 'execute') as anon_can_run from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1;
-- =====================================================================================================

-- 1. drop every policy that serves anon (or everyone) on the three data tables; the auth_* policies for signed-in members stay -----------
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
            where schemaname = 'public' and tablename in ('tracker_data', 'tracker_snapshots', 'activity_log')
              and ('anon' = any (roles) or 'public' = any (roles))
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 2. no privileges at all for anon on those tables (and on the old home-made users table, which holds password hashes) ----------------
revoke all on public.tracker_data, public.tracker_snapshots, public.activity_log from anon;
revoke all on sequence public.tracker_snapshots_id_seq from anon;
do $$
begin
  if to_regclass('public.app_users') is not null then
    execute 'revoke all on public.app_users from anon, authenticated';   -- the table is NOT dropped yet
  end if;
end $$;

-- 3. functions: nobody anonymous can run the old app_* functions or the internal helpers (the triggers keep running: a trigger function
--    needs EXECUTE only when the trigger is created, not when it fires). The new sign-in helpers keep their authenticated-only grants. ----
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and (p.proname like 'app\_%' or p.proname in ('tracker_arr_len', 'tracker_data_before_update', 'activity_log_retention'))
              and p.proname not in ('app_whoami')
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
  end loop;
end $$;
revoke execute on function public.is_member(), public.is_admin(), public.my_display_name(), public.app_whoami() from public, anon;

notify pgrst, 'reload schema';

-- =====================================================================================================
-- VERIFICATION (the assistant runs these checks after applying; replace <PROJECT_URL> and use the publishable key as apikey)
--   anon, no sign-in (expect 401/403, an empty list, or no change; never data):
--     GET   <PROJECT_URL>/rest/v1/tracker_data?select=id          -> 401 or []        (never the document)
--     GET   <PROJECT_URL>/rest/v1/tracker_snapshots?select=id      -> 401 or []
--     GET   <PROJECT_URL>/rest/v1/activity_log?select=id           -> 401 or []
--     PATCH <PROJECT_URL>/rest/v1/tracker_data?id=eq.2  {"doc":{}} -> 401, or 204/200 with nothing changed (confirm the document is intact)
--     POST  <PROJECT_URL>/rest/v1/rpc/app_login {...}              -> 401/404 (function no longer callable)
--   signed in as a MEMBER (Authorization: Bearer <that member's access token>):
--     GET   tracker_data?id=eq.2&select=version     -> one row            PATCH tracker_data?id=eq.2&version=eq.N -> works
--     POST  tracker_data (a new row)                -> refused            DELETE tracker_data?id=eq.2             -> refused (nothing deleted)
--     GET   tracker_snapshots / activity_log        -> [] (empty)         POST activity_log with a different "by"  -> refused
--   signed in as the ADMIN:
--     GET   tracker_snapshots?select=id&limit=1 -> a row     GET activity_log?select=id&limit=1 -> a row     GET app_members -> all rows
--
-- ROLLBACK (one paste: restores the open anon access exactly as the portal had it before this file; use only if you are locked out)
--   Policies (the names and rules are the ones created by the original setup SQL, save-safety.sql and activity-log.sql):
--   create policy "app read"        on public.tracker_data      for select to public using (true);
--   create policy "app insert"      on public.tracker_data      for insert to public with check (true);
--   create policy "app update"      on public.tracker_data      for update to public using (true) with check (true);
--   create policy "snapshots read"  on public.tracker_snapshots for select to anon, authenticated using (true);
--   create policy "activity read"   on public.activity_log      for select to anon, authenticated using (true);
--   create policy "activity insert" on public.activity_log      for insert to anon, authenticated with check (true);
--   Grants (Supabase's default table grants for tracker_data; the exact ones for the other two come from their own files):
--   grant all on public.tracker_data to anon;
--   grant select on public.tracker_snapshots to anon;  grant usage, select on sequence public.tracker_snapshots_id_seq to anon;
--   grant select, insert on public.activity_log to anon;
--   Functions:
--   do $$ declare r record; begin
--     for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--               where n.nspname = 'public' and (p.proname like 'app\_%' or p.proname in ('tracker_arr_len', 'tracker_data_before_update', 'activity_log_retention'))
--                 and p.proname not in ('app_whoami')
--     loop execute format('grant execute on function %s to public, anon', r.sig); end loop; end $$;
--   Old users table: grant all on public.app_users to anon, authenticated;   -- only if it existed and was open before (check your saved record)
--   notify pgrst, 'reload schema';
-- =====================================================================================================
