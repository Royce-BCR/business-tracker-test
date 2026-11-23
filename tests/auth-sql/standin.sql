-- Stand-ins for the Supabase pieces the SQL files rely on (LOCAL TEST ONLY). Reproduces the live state BEFORE Stage S.
do $$ begin if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if; if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if; end $$;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;       -- Supabase's defaults
alter default privileges in schema public grant all on sequences to anon, authenticated;
-- the original setup SQL (policies for everyone, as shown in Settings before Save Safety)
create table tracker_data (id int primary key default 1, doc jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), constraint single_row check (id in (1, 2)));
insert into tracker_data (id, doc) values (1, '{"contacts":[{"id":"a"}]}'), (2, '{"contacts":[{"id":"a"},{"id":"b"}]}');
alter table tracker_data enable row level security;
create policy "app read"   on tracker_data for select using (true);
create policy "app insert" on tracker_data for insert with check (true);
create policy "app update" on tracker_data for update using (true) with check (true);
grant all on tracker_data to anon, authenticated;
-- the old home-made users table and login function
create table app_users (username text primary key, password_hash text, role text);
insert into app_users values ('old', 'x', 'admin');
create function app_login(p_username text, p_password text) returns table (username text, role text) language sql security definer as $$ select username, role from app_users where username = p_username $$;
create function app_list_users() returns setof app_users language sql security definer as $$ select * from app_users $$;
