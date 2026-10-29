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

## Buying, orders, deliveries and the invoice check (Stage 2, test site)

- **Project stages**: six stages (Planning, Materials, On site, Sign-off, Invoiced, Completed) are worked out from confirmed milestone dates and shown on the board, profile and list. Nothing is stored: the nine stored stages and each project's `stageId` are untouched.
- **Orders and deliveries** (Operations): one order per supplier from the accepted quote, plus a second order for the same supplier (a second delivery on the Working plan with the chosen lines moved onto it). The order page shows project, quote, supplier, planned and actual delivery, tasks and the delivery check. It opens to the same record from the project, the supplier and the menu.
- **Delivery checklist**: marking a delivery complete (Today, order, project) opens the lines as received, short, substituted or damaged, with notes and photos. Today has a one-tap "All received". Short or substituted marks the delivery "price to confirm".
- **Confirm prices**: after a delivery, now or later (later makes a task on Today and the order). Upload or photograph the invoice or receipt and enter final quantities and prices per line. Quote and order prices never change; a confirmed supplier payment starts from the confirmed figures and the same file.
- **Variance and hire**: differences carry a cause (price, quantity, substitution, delivery charge, error, other) and are flagged above **Settings > Quotes > Supplier price variance** (default 0%, so everything is flagged). By-cause tables on the order, project Overview and the Orders and deliveries page. Any quote, plan or order line can be marked **hire** with a hire supplier; it counts as a supplier cost and shows as its own row on the project.
- **Materials and deliveries tab** on the project: planned against actual graph (hollow planned, filled actual, late in red, today line) and a date-ordered list with one confirm button per row.
- **Supplier invoices** (Operations): receipts and invoices linked to their orders, projects and suppliers.

New stored fields, all optional and empty by default: `project.dropState[drop].check` and `.ptc`; `order.pc`, `order.receipts`, `order.items[].hire`; `quote line.hire` and `.hireSupplierId`; `task.autoKey`; `settings.varianceThresholdPct`.

## Selling: leads, qualification and quotes (Stage 3, test site)

- **Lead fields** (carried lead to sales to project): ballpark value (the existing estimated value), estimated duration in days (or phases), the customer's preferred start, a deadline, and a job type from a Settings list. A job type can be marked **Not a fit** and is flagged. The project's old free-text "Job type" is now labelled "Job detail".
- **Customer lifecycle** on contacts and companies (Lead, Opportunity, Customer, Referrer, Evangelist; names and order in Settings > Selling). Worked out from the old tags and the deals, never stored, until someone sets it by hand. The tags themselves are untouched.
- **Qualification gates** (Settings > Selling): questions, a weight for each, and hard gate or guide (per question and as the default). Answers carry a rating (Good, Unclear, Poor). The score (Strong, Unclear, Weak) shows as a badge on the lead, sales and project. A hard-gate question that is unanswered or rated Unclear or Poor stops promotion and the message names it. There is no override. The four starting questions keep their answers in the lead's existing fields.
- **Closed lost** on all three boards: reason (default Stalled), a Closed lost archive bar under the board, Reopen to the previous stage; both are logged in the activity feed. Needs-attention markers: quote sent with no follow-up, a gate not answered, no activity.
- **Sales stages**: the proposal (Site visit, Scoping, Quoted, Negotiation, Commitment, Won) is applied only when you press the button in Settings > Selling. It renames existing stages and adds two; no card moves.
- **Quotes**: sending creates one follow-up task (autoKey `fu:<quote id>`) due after the gap in working days (default 3); **Chased** logs the channel and note and suggests the next one; a days-since-contact flag at 5 working days (quotes and leads). The quotes list shows days since contact and next follow-up with links to each record. Approvals is now the **Review** tab on Quotes.
- **Several prices per line** gain lead time and valid until; a **Compare suppliers** card on each quote shows the whole-basket landed cost per supplier (cheapest highlighted) and the basket each supplier gets from the choices made, re-totalled as lines move. A supplier that is not the cheapest for a line asks for a reason, saved on the quote.
- **Approver access type** (Settings > Selling): scope commercial, finance or both; read-only view; decisions through Review. Built, not switched on: no user or login exists for it. An admin can preview it in their own browser.
- **Menu**: Invoicing is now **Customer invoices**.

New stored fields, all optional and defaulting empty or to the values above: lead, sale and project `estDays`, `phases`, `prefStart`, `deadline`, `jobTypeId`, `qa`, `qRate`, `lost*`; contact and company `lifecycle`; quote `overrides` and price `leadTimeDays`, `validUntil`; `state.jobTypes`, `state.lifecycle`, `state.qualQuestions`; settings `qualGateDefault`, `followUpGapDays`, `followUpTaskName`, `noContactDays`, `approverScope`; a Stalled lost reason. The old `settings.followUpDays` (calendar days) is kept but no longer used.

## Planning, time and capacity (Stage 4, test site)

- **Settings > Planning & capacity** (new): bank holidays and unavailable days (England and Wales 2026 and 2027 listed to start with; the working week is Monday to Friday and can be changed), the **phase template**, and **people and capacity** (weekly hours each, their own unavailable days, and the hours in a working day, which is the existing Hours per day setting).
- **Working days** are counted in one place that knows about the list above: duration and complete date on a project, the quote follow-up gap, days since contact and the reschedule review. No stored date is changed.
- **Phases** (leads, sales and projects) gain optional hours, start, end and a selling-time tick. A new lead or sales deal is pre-filled from the template; existing jobs are only changed by pressing **Apply the template** on them. Phase hours add up to Hours planned on the project profile (the Working plan figure is used when no phase has hours).
- **Tick then confirm**: dated phases that are due show on Today. Ticking one saves its budget as **assumed**; the dialog that follows lets you adjust in 15-minute steps and save as **confirmed**. Hours logged on a project add these to the stage-line time logs, with the assumed or confirmed marker beside them.
- **Cost of selling** (Dashboard): hours on selling phases at the labour rate (hourly rate, or day rate over hours in a day), including lost deals.
- **Gantt** at the top of every project's Plan tab: phases with hours and markers, stage lines, milestones, deliveries, today, and the project's hours against capacity by week. Phase dates changed there go through Confirm schedule, Keep as tentative or Cancel.
- **Calendar and capacity** (Command): weekly demand against capacity with layers (projects, sales and leads weighted by probability, deliveries, business tasks). Over-capacity weeks list their projects and leads; a week or a day opens that day on Today.
- **Reschedule review** warns by capacity instead of by overlapping dates, and suggests Tentative. A tentative project stays on the calendar in full, striped.

New stored fields, all optional and defaulting safely: `state.holidays`, `state.phaseTemplate`, `state.people`; `settings.workingWeek`, `settings.leadWeightPct` (default 20); phase `hours`, `start`, `end`, `selling`, `done`; `project.tentative.prev.phases`. Nothing existing is renamed, removed or converted.

## Money foundations (Stage 5, test site)

- **Classify** (Finance): each money-out line can be a job cost (with its project), a business cost or an asset purchase. The class is suggested from the category and only stored when accepted, one at a time or with "Accept all suggestions" (asks first). Unclassified costs share one rolling task on Today. No amount, date, category or link on a transaction is changed.
- **Business costs** (Business): recurring costs with a due date feed the Cash Flow Forecast; a matching transaction is suggested and ticked off when you confirm. Monthly figure and break-even sales. "Start from the existing overheads" copies the five Pricing Model lines (they stay); "Use this list for the Pricing Model overheads" is off until pressed and confirmed.
- **Set-aside method per pot** (Settings, Finance): percentage (default, 30, 25, 20, 25) or a fixed monthly amount. Default figures are unchanged.
- **Assets**: optional charge per use (Settings switch "Tool cost on jobs", off by default), tools used on a job, hire cost and expected uses on the asset plan with buy against hire side by side.
- **Money tab** on a project: four figures, planned against actual graph, one confirm button per planned line (reusing the invoice and supplier payment confirmations). Margin now and job cost here use confirmed receipt prices.
- Settings: default lead weighting (Planning and capacity). Hours logged on a project shows the split by source.
- `stage5-profit-note.md` explains the order in which money is taken today.

New stored fields, all optional: `transaction.costClass`, `.costProjectId`, `.classHow`, `.classAt`, `.classBy`; `state.businessCosts`; `settings.bizCostsForOverheads`, `settings.pot*Method`, `.pot*Fixed`, `.pot*From`, `settings.toolCostOnJobs`; `asset.usageCharge`, `.usageAfter`; plan item `.hireCost`, `.uses`; `project.toolUse`. Tasks now keep their `autoKey` when a saved document is loaded.
