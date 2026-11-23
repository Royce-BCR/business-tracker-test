-- =====================================================================================================
-- ACTIVITY LOG  (Settings > Activity: who changed what, and when)
-- Written for the Business Tracker. NOT RUN by Claude: Royce's assistant reviews and applies it once in Supabase > SQL Editor.
-- Idempotent (safe to run twice) and additive: nothing existing is changed or dropped. Safe for the live site while it is running.
--
-- THIS IS A VISIBILITY TOOL, NOT A BACKUP. The backup is the tracker_snapshots history from save-safety.sql.
--
-- SECURITY NOTE (same flag as save-safety.sql): the portal talks to Supabase as the anon role with a publishable key that is in the page
-- source. anon can INSERT and SELECT here (the portal needs both). That means anyone with the key could add false log rows or read the log.
-- anon can NOT update or delete rows (no policy, and the grants are revoked as a second lock), so a row that was written cannot be altered
-- from the REST API; only the retention trigger below removes rows, and only ones older than 12 months.
--
-- WHAT IT DOES
--   1. activity_log table. id is a uuid made by the BROWSER, so a retried write can never create a duplicate: the portal inserts with
--      "on_conflict=id" and "Prefer: resolution=ignore-duplicates", which turns a repeat into a no-op.
--   2. Index (doc_id, at desc, id desc): the Activity screen pages with a cursor on (at, id), never with offsets.
--   3. RLS: anon (and authenticated) get SELECT and INSERT only.
--   4. Retention: rows older than 12 months are deleted, done cheaply by a statement-level trigger after each insert (one indexed delete per
--      insert statement, not per row, and only for the doc_ids just written to).
--   5. Light size limits so one bad client cannot store something huge. If a row breaks a limit the portal drops just that row.
--
-- AFTER RUNNING: nothing else to do. Until it is applied the portal keeps its queue of activity events on the device (capped at 500),
-- shows "Activity will appear once the database update is applied" on the Activity screen, and saving the main data is not affected.
-- =====================================================================================================

create table if not exists public.activity_log (
  id            uuid        primary key,
  doc_id        int         not null,
  at            timestamptz not null default now(),
  by            text,
  area          text,
  record_id     text,
  record_label  text,
  action        text,
  summary       text,
  changes       jsonb,
  session       text,
  constraint activity_log_sizes check (
        char_length(coalesce(by, ''))           <= 120
    and char_length(coalesce(area, ''))         <= 60
    and char_length(coalesce(record_id, ''))    <= 120
    and char_length(coalesce(record_label, '')) <= 200
    and char_length(coalesce(action, ''))       <= 30
    and char_length(coalesce(summary, ''))      <= 600
    and char_length(coalesce(session, ''))      <= 60
    and (changes is null or (jsonb_typeof(changes) = 'array' and jsonb_array_length(changes) <= 60 and pg_column_size(changes) <= 40000))
  )
);

create index if not exists activity_log_doc_at_idx on public.activity_log (doc_id, at desc, id desc);

-- row level security: the portal may read and add rows, nothing else --------------------------------
alter table public.activity_log enable row level security;
drop policy if exists "activity read"   on public.activity_log;
drop policy if exists "activity insert" on public.activity_log;
create policy "activity read"   on public.activity_log for select to anon, authenticated using (true);
create policy "activity insert" on public.activity_log for insert to anon, authenticated with check (true);
revoke all on public.activity_log from anon, authenticated;
grant select, insert on public.activity_log to anon, authenticated;

-- retention: delete rows older than 12 months, once per insert statement ------------------------------
create or replace function public.activity_log_retention() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.activity_log a
   where a.doc_id in (select distinct n.doc_id from newrows n)
     and a.at < now() - interval '12 months';
  return null;
end $$;

drop trigger if exists activity_log_retention on public.activity_log;
create trigger activity_log_retention
  after insert on public.activity_log
  referencing new table as newrows
  for each statement execute function public.activity_log_retention();

-- make PostgREST (the Supabase REST layer) notice the new table straight away
notify pgrst, 'reload schema';

-- =====================================================================================================
-- STORAGE ESTIMATE
--   About 300 bytes a row for a plain row (summary about 60 characters, a name, a person, ids and the index entry); rows that list changed
--   fields carry a few hundred bytes more, so budget about 500 bytes a row to be safe.
--   Typical use is a few hundred rows a day while people are editing (one row per changed record per save, and a bulk change such as
--   "Build contacts" or an import is ONE row). At a generous 500 rows a day x 500 bytes = about 250 KB a day = about 90 MB a year, and the
--   12-month retention caps it there. A quiet business is a tenth of that (under 10 MB). The Supabase Free plan allows 500 MB for the whole
--   database (the Save Safety snapshots use up to about 100 MB of it), so the worst case here still fits; check the database size after a month.
--
-- ROLLBACK (the portal keeps working; it just stops showing and recording activity)
--   drop trigger if exists activity_log_retention on public.activity_log;
--   drop function if exists public.activity_log_retention();
--   drop table if exists public.activity_log;       -- loses the log: nothing else depends on it
--   notify pgrst, 'reload schema';
-- =====================================================================================================
