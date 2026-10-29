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

## Customers, supplier quote requests and invoices

Added on the test site (all stored in the same document, all optional and defaulting empty so existing data loads unchanged):

- **Contacts and Companies** (CRM menu): contacts, companies, links between them, and links to deals, quotes, invoices and payments. "Build contacts now" on the Contacts page creates contacts from existing records without merging anything; "Review duplicates" is where merges are confirmed (and undone from Undo history).
- **Request supplier quotes** (quote > Materials): one request-for-quote document and ready-written email per supplier, with status on each supplier column and a reminder on Today when a reply is overdue.
- **Invoices** (Invoicing > Create invoice): locked invoice documents made from the payment schedule and approved variations, with void / replacement, credit notes and payment reminders.
- **Settings > Documents & email**: business and bank details, numbering, and the editable email templates.

### Adding direct email sending later

Today the app only *prepares* emails (it opens your mail app; you attach the PDF and press send). `sendEmailDirect()` in `index.html` is the empty hook, and "Direct sending: coming soon" is a disabled setting. To build it you need: an email provider (or Microsoft 365 sending), a Supabase edge function (for example `send-email`) that the page calls with the signed-in session, a verified sender domain (SPF / DKIM), the provider key stored as an edge-function secret (never in the page), and a way to attach the generated PDF (render it server-side or upload it to storage and pass a reference).

## Planned vs actual, quote locking, supplier payments, reconciliation (Lynton fixes)

Added on the test site, all optional and defaulting safely so existing data loads unchanged:

- **Planned and actual dates.** Typed milestone and stage dates are *planned* dates (changes need a reason and are kept in the history). A milestone or stage is done only when someone presses Mark done (or the records prove it: paid or invoiced payment lines, deliveries marked delivered, the quote's accepted date). The project stage only moves on confirmed actuals. The Project Pipeline shows a one-off "Check existing projects" card listing what changed from Done to Planned on screen; nothing stored is rewritten until you confirm it.
- **Quotes.** Sent and Accepted quotes are read-only; "Make a new version to change this" copies to an editable Draft (keeping line and drop ids) and marks a Sent original Superseded. Accepting a new version shows a change list and carries the Working plan, delivery states, transactions and POs across.
- **Supplier payments.** "Confirm supplier payment" (project, PO or Transactions tab) records one transaction per delivery, cash or trade account, with the supplier used, the invoice and a quoted-vs-final table.
- **Cash.** Starting balance has an "as at" date (default 1 Oct 2026). The forecast shows only unsettled items; settled items are actuals in the month they happened. Finance > Bank Reconciliation reconciles a month per account, tracks loans and locks reconciled months.
- **Profit share** can be £ per labour hour or % of labour cost, with a per-project override.
- **Projects** show a journey strip and a Next step; completed projects move to a Completed view and can be reopened.

## Record pages, tasks and Today (Stage 1, test site)

- **Menu**: Command, CRM, Commercial, Operations, Finance, Business and Settings. Every page keeps its route; Actions and Setup & Admin now sit together on **Business tasks**.
- **Record pages**: a project, supplier, contact or company opens in three columns (profile, tabs, linked records). The project profile marks each value as locked, calculated (with where to change it) or editable; edits wait in a bar at the foot of the profile. The earlier project page is still there under **Open full workspace**.
- **Tasks**: one task form (job or business, assignee, repeat, links to projects, customers, suppliers, quotes and orders). Business tasks are only visible to the people ticked under Settings > CRM & tasks (Lynton and Royce by default).
- **Activity feed**: on every record, a view over real records: open tasks first, history below, existing timeline notes shown as they are stored.
- **Today**: a day view with arrows and a date picker; list length is a setting (default 10).
- **Plan tab**: a date change in the profile opens a review of every linked date; Confirm schedule, Keep as tentative, or Cancel changes.

New stored fields, all optional: `project.jobType`, `project.owner`, `project.site`, `project.tentative`; `task.scope`, `task.refs`, `task.recur`, `task.spawnedId`; `settings.bizAccess`, `settings.todayLimit`. Existing data loads unchanged.
