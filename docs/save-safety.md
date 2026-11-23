# Save safety (what it does, how to apply it, how to undo it)

Written after the 23 Nov 2026 data loss: edits showed on screen but never reached Supabase, and on reload the older cloud copy silently replaced the browser's copy.

## What you see
A small chip in the top bar (next to the brand pill) is the only signal. No banners.

| Chip | Meaning |
| --- | --- |
| ⟳ **Saving…** (spinning) | A change is on its way to the cloud. |
| ⟳ **Backed up · Now / 5 min ago / 2 h ago / yesterday 16:40** (green) | The cloud copy is known to match your screen. Refreshes every 30 s; the exact time is in the tooltip. |
| ⊗ **Not backing up · last backed up 14:32** (red circle with a cross) | The cloud refused or could not be reached. Retrying by itself: 10 s, 30 s, 1 min, 5 min, then every 5 min, and straight away when the browser comes back online or the tab is shown again. |
| ⊗ with a wavy line | Same, but the device is offline. |
| ⊗ with a pause bar: **Paused · newer changes elsewhere · last backed up 14:32** | Someone else (another device or tab) saved first. Nothing is overwritten. Your edits stay on screen and in this browser. |
| ⊗ **Paused · save held back for your OK** | The save would remove a lot of records (shrink guard), or it would put sample data over real data. |
| ⊗ **Saved on this device only** | The cloud is not connected, or was unreachable when the portal opened. It retries every 60 s. |

The ⓘ next to the chip explains the state in plain words and offers **Retry now**, **Download my data (.json)** and, when paused, **Reload to get the latest**. It opens on hover, on keyboard focus (Escape closes) and on tap.

## What happens underneath
- Every edit saves after 500 ms; the portal also checks the cloud every 30 minutes (and when you return to a tab that was hidden for more than 5 minutes).
- The browser marks itself *dirty* and writes `<key>-meta` before any cloud attempt, and clears it only when the cloud confirms.
- Saves are compare-and-swap: `PATCH tracker_data?id=eq.N&version=eq.V`. An empty answer means someone else saved first, so the portal pauses instead of overwriting.
- On every load and every reconnect, a browser copy with unsaved work is **never** overwritten. A rescue copy goes to `<key>-rescue-<time>` (last 3 kept, or a .json download if the browser is full) and one dialog offers: keep this browser's version / use the cloud version / add only the records missing from the cloud (additive; counters take the higher value). Whichever you do not keep is downloaded first.
- The browser's leave-page prompt appears only while there are unsaved changes.
- Shrink guard: a save that drops any of contacts, leads, quotes, projects, invoices, tasks, transactions or suppliers by more than 20% and by 3 or more records, or the document by more than 30%, waits for your OK. Single deletions never trigger it. Sample data is never saved over a real cloud document (so "Reset to sample data" is switched off while the cloud is connected).
- Import asks first (file date and counts versus now) and downloads your current data before replacing it. Export is unchanged (exactly what is on screen) and the file name now has the time.
- Settings > Data > Version history lists the last 30 days of server snapshots, with download and restore (restore goes through the normal save path).

## Applying the database update
`supabase/save-safety.sql` is written but **not run**. Until it is applied the portal works exactly as before, using the old `updated_at` comparison (one console warning), and Version history says it will appear once the update is applied.

1. Supabase > SQL Editor > New query, paste the whole file, Run. It is idempotent and additive.
2. Test on this test site first (row 2), then it is already in place for live (row 1): same table.
3. Check Settings > Data > Version history after a few saves.

Rollback is the commented block at the bottom of the file (drop trigger, function, table, column). The portal keeps working without it.

## Tests
`tests/save-safety/run.js` (Part H, Playwright, every Supabase call mocked) and `regress.js` (existing behaviour, run on the old and new builds).

```bash
cd tests/save-safety
NODE_PATH=$(npm root -g) HTML=../../index.html DOCID=2 PREFIX=bt-test- node run.js results.md
NODE_PATH=$(npm root -g) HTML=../../index.html DOCID=2 PREFIX=bt-test- node regress.js
```
