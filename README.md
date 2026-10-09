# Business Tracker — TEST site

This is the practice copy of the Business Tracker. It looks and works like the live site, but it reads and writes **row 2** of the `tracker_data` table in Supabase, while the live site uses **row 1**. Anything you change here never touches live data. Login accounts are shared between the two sites.

- Live site: https://royce-bcr.github.io/business-tracker/
- Test site: https://royce-bcr.github.io/business-tracker-test/

## How to promote a tested change to live

The whole app is one file, `index.html`. The only difference between the live and test copies is a small clearly commented block at the very top of the `<script>` section, headed **ENVIRONMENT SETTINGS**.

1. Test your change on the test site and check it works.
2. Copy this repo's `index.html` over the live repo's `index.html`.
3. In the live copy, put the environment block back to the live values:

   | Setting | LIVE value | TEST value |
   | --- | --- | --- |
   | `ENV_LABEL` | `'LIVE'` | `'TEST'` |
   | `DOC_ID` | `1` | `2` |
   | `STORAGE_PREFIX` | `''` (empty) | `'bt-test-'` |
   | `SUPABASE_URL` / `SUPABASE_KEY` | same | same |

4. Check the live file before publishing: search for `ENV_LABEL`, confirm it says `'LIVE'`, `DOC_ID` is `1` and `STORAGE_PREFIX` is empty. The amber "TEST SITE" banner and `[TEST]` tab title must not appear.
5. Commit and push the live repo.

Never leave `DOC_ID = 2` or the `bt-test-` prefix in the live file. That would point live users at the test data and make everyone log in again.

The amber banner code stays in the file when promoted. It does nothing unless `ENV_LABEL` is `'TEST'`.

## Refreshing test data

Row 2 is a copy of live data taken when this site was set up. To refresh it, copy row 1's `doc` into row 2 in Supabase.
