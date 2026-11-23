-- =====================================================================================================
-- SAVE SAFETY  (version column, server-side timestamps, snapshot history, retention)
-- Written for the Business Tracker. NOT RUN by Claude: Royce applies it once in Supabase > SQL Editor.
-- Idempotent (safe to run twice), additive (nothing is dropped or rewritten), safe for the live site while it is running.
--
-- SECURITY FLAG FOR ROYCE: the anon role can currently READ AND WRITE ALL BUSINESS DATA on tracker_data
-- (the setup SQL created "app read / app insert / app update" policies with USING (true)), and the publishable key is in
-- the page source. Anyone who has the site address can read, change or wipe the data straight from the REST API.
-- This file does NOT change that for tracker_data (the portal needs it today). It keeps the new history table
-- read-only for anon, and writable only by the trigger. Moving the portal to real Supabase Auth, or putting the
-- writes behind a security-definer function, is the proper fix: a separate job.
--
-- WHAT IT DOES
--   1. tracker_data.version  integer not null default 1   (the browser saves with  ?id=eq.N&version=eq.V  = compare-and-swap)
--   2. BEFORE UPDATE trigger on tracker_data:
--        a. updated_at := now()  (server clock, not the browser's)   version := old version + 1
--        b. snapshots the OLD document into tracker_snapshots when there is no snapshot for that doc in the last
--           30 minutes (reason 'interval'), or when the new document is more than 15% smaller (reason 'shrink')
--        c. first snapshot of each calendar day (Europe/London) is marked keep = true
--        d. retention, done cheaply inside the trigger: non-keep snapshots older than 7 days and keep snapshots older
--           than 60 days are deleted (only when a snapshot has just been taken)
--   3. tracker_snapshots(id, doc_id, taken_at, reason, bytes, counts, keep, doc) + index (doc_id, taken_at desc)
--   4. RLS on tracker_snapshots: anon gets SELECT only. Rows are inserted only by the security-definer trigger.
--
-- AFTER RUNNING: nothing else to do. The portal detects the new column on its own (until then it falls back to the
-- old updated_at comparison and logs one console warning). Test first on the TEST site (row 2); live (row 1) uses the same table.
-- =====================================================================================================

-- 1. version column ---------------------------------------------------------------------------------
alter table public.tracker_data add column if not exists version integer not null default 1;

-- 3. snapshot table ---------------------------------------------------------------------------------
create table if not exists public.tracker_snapshots (
  id        bigserial primary key,
  doc_id    int         not null,
  taken_at  timestamptz not null default now(),
  reason    text,
  bytes     int,
  counts    jsonb,
  keep      boolean     not null default false,
  doc       jsonb       not null
);
create index if not exists tracker_snapshots_doc_taken_idx on public.tracker_snapshots (doc_id, taken_at desc);

-- 4. row level security: read-only for the portal --------------------------------------------------
alter table public.tracker_snapshots enable row level security;
drop policy if exists "snapshots read" on public.tracker_snapshots;
create policy "snapshots read" on public.tracker_snapshots for select to anon, authenticated using (true);
-- no insert / update / delete policy exists, and the grants are removed as a second lock
revoke all on public.tracker_snapshots from anon, authenticated;
grant select on public.tracker_snapshots to anon, authenticated;
revoke all on sequence public.tracker_snapshots_id_seq from anon, authenticated;

-- 2. trigger ----------------------------------------------------------------------------------------
-- length of a jsonb array under a key (0 when missing or not an array)
create or replace function public.tracker_arr_len(d jsonb, k text) returns int
language sql immutable as $$
  select case when jsonb_typeof(d -> k) = 'array' then jsonb_array_length(d -> k) else 0 end
$$;

create or replace function public.tracker_data_before_update() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  old_txt   text;
  new_txt   text;
  old_bytes int;
  new_bytes int;
  why       text;
  today_has boolean;
begin
  -- (a) server time and the next version, whatever the browser sent
  new.updated_at := now();
  new.version    := coalesce(old.version, 1) + 1;

  -- nothing to protect when the old document was empty or did not change
  if old.doc is null or old.doc = '{}'::jsonb or old.doc is not distinct from new.doc then
    return new;
  end if;

  old_txt := old.doc::text;  new_txt := new.doc::text;
  old_bytes := octet_length(old_txt);  new_bytes := octet_length(new_txt);

  -- (b) when to snapshot
  if new_bytes < old_bytes * 0.85 then
    why := 'shrink';
  elsif not exists (select 1 from public.tracker_snapshots s where s.doc_id = old.id and s.taken_at > now() - interval '30 minutes') then
    why := 'interval';
  end if;

  if why is not null then
    -- (c) first snapshot of the (London) calendar day is kept longer
    select not exists (select 1 from public.tracker_snapshots s
                        where s.doc_id = old.id
                          and (s.taken_at at time zone 'Europe/London')::date = (now() at time zone 'Europe/London')::date)
      into today_has;
    insert into public.tracker_snapshots (doc_id, reason, bytes, counts, keep, doc)
    values (old.id, why, old_bytes,
            jsonb_build_object(
              'contacts',     public.tracker_arr_len(old.doc, 'contacts'),
              'leads',        public.tracker_arr_len(old.doc, 'leads'),
              'quotes',       public.tracker_arr_len(old.doc, 'quotes'),
              'projects',     public.tracker_arr_len(old.doc, 'projects'),
              'invoices',     public.tracker_arr_len(old.doc, 'invoices'),
              'crmTasks',     public.tracker_arr_len(old.doc, 'crmTasks'),
              'transactions', public.tracker_arr_len(old.doc, 'transactions')),
            today_has, old.doc);

    -- (d) retention (cheap: the index is on doc_id, taken_at)
    delete from public.tracker_snapshots s
     where s.doc_id = old.id
       and ((not s.keep and s.taken_at < now() - interval '7 days')
         or (s.keep     and s.taken_at < now() - interval '60 days'));
  end if;
  return new;
end $$;

drop trigger if exists tracker_data_before_update on public.tracker_data;
create trigger tracker_data_before_update
  before update on public.tracker_data
  for each row execute function public.tracker_data_before_update();

-- make PostgREST (the Supabase REST layer) notice the new column and table straight away
notify pgrst, 'reload schema';

-- =====================================================================================================
-- STORAGE ESTIMATE (measured on the real document, not guessed)
--   Measured: 779,086 JSON characters are stored as 582,168 bytes, so jsonb saves only about 25%, not the 3 to 5 times
--   I first assumed. Budget about 0.58 MB (570 KB) per snapshot.
--   Retention is 7 days for ordinary snapshots and 60 days for the one-a-day keep = true snapshots.
--   At most about 16 snapshots a day (one per 30 minutes of active editing, plus shrink snapshots) x 7 days = about 112 snapshots,
--   plus one keep snapshot a day for the 53 older days (days 8 to 60) = about 165 snapshots in total
--   x 0.58 MB = about 96 MB, so budget about 100 MB WORST CASE per document. Normal use is far less, because snapshots only happen
--   while someone is editing. Live (row 1) and test (row 2) share the table, but test normally has far fewer edits.
--   The Supabase Free plan allows 500 MB for the whole database, so this fits, using up to about a fifth of it at the very worst.
--   If the document grows, the estimate grows with it: check the database size in Supabase after a week, and shorten the periods
--   in section (d) if needed.
--
-- ROLLBACK (run these if you ever need to undo it; the portal keeps working, it falls back to the old updated_at check)
--   drop trigger if exists tracker_data_before_update on public.tracker_data;
--   drop function if exists public.tracker_data_before_update();
--   drop function if exists public.tracker_arr_len(jsonb, text);
--   drop table if exists public.tracker_snapshots;          -- loses the saved history: download any versions you want first
--   alter table public.tracker_data drop column if exists version;
--   notify pgrst, 'reload schema';
-- =====================================================================================================
