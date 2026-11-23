-- =====================================================================================================
-- STAGE S, STEP 1 OF 2:  auth-stage-a.sql  (sign-in tables, helper functions and policies for signed-in members)
-- Written for the Business Tracker. NOT RUN by Claude: Royce's assistant reviews and applies it once in Supabase > SQL Editor.
-- Idempotent (safe to run twice) and additive for anon: it does NOT remove any access the portal has today.
--
-- ORDER AND RISK
--   1. Run THIS file first. It is safe while the live site is running: anon (the public key) keeps exactly the access it has now, so the
--      old portal and the new portal both keep working. The only existing rules it touches are the legacy "everyone" policies, which it
--      narrows to the anon role so they can no longer help a signed-in user get more than a member should (a member must never be able to
--      add or delete a tracker_data row, or read the snapshots or the activity log).
--   2. Create the five accounts in the Supabase dashboard (Authentication > Users), then seed app_members (template at the bottom).
--   3. Deploy the new portal (it needs this file). Every member signs in once.
--   4. ONLY THEN run auth-stage-b.sql (the lockdown). Do not run Stage B before everyone has signed in once.
--
-- WHO CAN DO WHAT AFTER THIS FILE (signed-in = role "authenticated" with an ACTIVE row in app_members)
--   tracker_data      member: SELECT, UPDATE (the document only). Nobody signed in can INSERT or DELETE (there is no such policy at all).
--   tracker_snapshots admin: SELECT. Members: nothing. Rows are written only by the security-definer trigger.
--   activity_log      member: INSERT, and only with by = their own display_name. admin: SELECT. Members cannot read it.
--   app_members       member: SELECT own row. admin: SELECT all, UPDATE active and display_name (never role, never your own active flag off).
-- =====================================================================================================

-- 1. members table ---------------------------------------------------------------------------------
create table if not exists public.app_members (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  display_name text not null,
  role         text not null check (role in ('admin', 'member')),
  active       boolean not null default true,
  created_at   timestamptz default now()
);
alter table public.app_members enable row level security;
revoke all on public.app_members from public, anon;

-- 2. helper functions: true only for an ACTIVE member; security definer so they can read app_members whatever the caller's rights ---
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.app_members m where m.user_id = auth.uid() and m.active)
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.app_members m where m.user_id = auth.uid() and m.active and m.role = 'admin')
$$;
create or replace function public.my_display_name() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select m.display_name from public.app_members m where m.user_id = auth.uid() and m.active
$$;
-- "who am I" in one request (the portal calls it right after sign-in). Works for an inactive member too, so the portal can say why it refuses.
create or replace function public.app_whoami() returns table (display_name text, role text, active boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select m.display_name, m.role, m.active from public.app_members m where m.user_id = auth.uid()
$$;
revoke execute on function public.is_member(), public.is_admin(), public.my_display_name(), public.app_whoami() from public, anon;
grant  execute on function public.is_member(), public.is_admin(), public.my_display_name(), public.app_whoami() to authenticated;

-- 3. the legacy open policies keep serving anon only (they were created for everyone, which would include signed-in users) ----------
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
            where schemaname = 'public' and tablename in ('tracker_data', 'tracker_snapshots', 'activity_log')
              and policyname not like 'auth\_%'
  loop
    execute format('alter policy %I on public.%I to anon', r.policyname, r.tablename);
  end loop;
end $$;

-- 4. policies for signed-in members ----------------------------------------------------------------
-- tracker_data: read and update the document. No INSERT or DELETE policy exists for authenticated, so a member can never add or delete a row.
drop policy if exists auth_td_select on public.tracker_data;
drop policy if exists auth_td_update on public.tracker_data;
create policy auth_td_select on public.tracker_data for select to authenticated using (public.is_member());
create policy auth_td_update on public.tracker_data for update to authenticated using (public.is_member()) with check (public.is_member());
revoke insert, delete, truncate, references, trigger on public.tracker_data from authenticated;
revoke update on public.tracker_data from authenticated;
grant select on public.tracker_data to authenticated;
grant update (doc, updated_at) on public.tracker_data to authenticated;   -- the trigger sets updated_at and version itself

-- tracker_snapshots: admin read only
drop policy if exists auth_snap_select on public.tracker_snapshots;
create policy auth_snap_select on public.tracker_snapshots for select to authenticated using (public.is_admin());
revoke all on public.tracker_snapshots from authenticated;
grant select on public.tracker_snapshots to authenticated;

-- activity_log: members add rows as themselves; only admins read
drop policy if exists auth_act_select on public.activity_log;
drop policy if exists auth_act_insert on public.activity_log;
create policy auth_act_select on public.activity_log for select to authenticated using (public.is_admin());
create policy auth_act_insert on public.activity_log for insert to authenticated with check (public.is_member() and by = public.my_display_name());
revoke all on public.activity_log from authenticated;
grant select, insert on public.activity_log to authenticated;

-- app_members: own row (admins: all rows); admins may change active and display_name, and may not switch themselves off
drop policy if exists auth_mem_select on public.app_members;
drop policy if exists auth_mem_update on public.app_members;
create policy auth_mem_select on public.app_members for select to authenticated using (public.is_member() and (user_id = auth.uid() or public.is_admin()));
create policy auth_mem_update on public.app_members for update to authenticated using (public.is_admin()) with check (public.is_admin() and (user_id <> auth.uid() or active));
revoke all on public.app_members from authenticated;
grant select on public.app_members to authenticated;
grant update (active, display_name) on public.app_members to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================================================
-- SEEDING MEMBERS (the assistant runs this AFTER the five accounts exist under Authentication > Users)
-- Replace the example addresses below with the real ones when running. These are fake placeholders: nothing real is stored in the repo.
--
-- insert into public.app_members (user_id, email, display_name, role)
-- select u.id, u.email, v.display_name, v.role
--   from auth.users u
--   join (values
--     ('admin.example@example.invalid',  'Royce',  'admin'),
--     ('member1.example@example.invalid', 'Lynton', 'member'),
--     ('member2.example@example.invalid', 'Gerry',  'member'),
--     ('member3.example@example.invalid', 'Mike',   'member'),
--     ('member4.example@example.invalid', 'Peter',  'member')
--   ) as v(email, display_name, role) on lower(u.email) = lower(v.email)
-- on conflict (user_id) do update set display_name = excluded.display_name, role = excluded.role, active = true;
--
-- Check: select email, display_name, role, active from public.app_members order by role, display_name;   -- expect five rows
-- Turn someone off:  update public.app_members set active = false where lower(email) = lower('member1.example@example.invalid');
--
-- ROLLBACK OF THIS FILE (safe at any time before Stage B; the portal falls back to the old sign-in only if you also deploy the old portal)
--   drop policy if exists auth_td_select on public.tracker_data;      drop policy if exists auth_td_update on public.tracker_data;
--   drop policy if exists auth_snap_select on public.tracker_snapshots;
--   drop policy if exists auth_act_select on public.activity_log;     drop policy if exists auth_act_insert on public.activity_log;
--   drop policy if exists auth_mem_select on public.app_members;      drop policy if exists auth_mem_update on public.app_members;
--   -- the legacy policies were narrowed to "to anon": put them back for everyone with  alter policy "<name>" on public.<table> to public;
--   drop function if exists public.app_whoami();  drop function if exists public.my_display_name();
--   drop function if exists public.is_admin();    drop function if exists public.is_member();
--   drop table if exists public.app_members;
-- =====================================================================================================
