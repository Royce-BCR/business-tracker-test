# Activity log (Settings → Activity)

A visibility tool: what has been changed in the portal, by whom and when. **It is not a backup**: the snapshots in Settings → Data → Version history are the backup.

## What gets recorded
- At every save the Save Safety engine compares the document with the last cloud-confirmed copy and produces one row per changed record: **added**, **edited** (the changed fields, before and after), **deleted**, or **moved** (a stage change on a project, lead or deal).
- Covers contacts, companies, leads, deals, projects, quotes, invoices, tasks, actions, transactions, suppliers, purchase orders, and settings areas (day types, holidays, people, assumptions…).
- Never logged: timestamps and bookkeeping, timeline / planned-date logs, undo log, table and navigation state, counters, the contacts report, the portal's own rolling "Classify transactions" task. Files and base64 data are never stored (`(file changed)`); long text is "notes edited"; other values are cut at 200 characters.
- A bulk change (Build contacts, import, restore, or any save with 6+ records of one kind changed) is **one** row: "Added 300 contacts: A, B, C and 297 more".
- System rows: cloud save failed / recovered, status went red, rescue copy created, import, export, restore, Build contacts, the load-check choices.
- **Who**: the "Who are you?" value (or the matching login); otherwise "Unknown". Each browser has a session id.

## Delivery
Rows are queued on the device and sent in one batch **after** the cloud save succeeded, so the log matches what is really in the cloud. If the send fails the queue stays in the browser and retries with the save engine's backoff (10 s, 30 s, 1 min, 5 min…); each row has a browser-made uuid and is inserted with `on_conflict=id` + `ignore-duplicates`, so a retry can never duplicate. While the main save is failing nothing is sent. A failed log write never blocks or delays saving. If the table does not exist yet the portal stays silent and keeps at most 500 events.

## The screen
Today's edits first, grouped by day with sticky headers; 20 rows at a time; **Load more** fetches the next 20 older rows with a cursor on (time, id) (never an offset). Filters (person, area, search text, Today only, hide system events) are applied by the database, so Load more keeps working inside a filter. Each row expands to show before and after; the record name is a link when the record still exists.

## Applying the database update
`supabase/activity-log.sql` (not run). Idempotent and additive; anon can SELECT and INSERT only; rows older than 12 months are deleted by a statement-level trigger. Rollback and a storage estimate are in the file. Until it is applied, the Activity screen says so and nothing else changes.

## Tests
`tests/activity-log/run.js` (Part D) and, on top of it, `tests/save-safety/run.js` (all Save Safety tests).

```bash
cd tests/activity-log
NODE_PATH=$(npm root -g) HTML=../../index.html DOCID=2 PREFIX=bt-test- node run.js results.md
```
