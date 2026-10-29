# Go-live notes: moving the rebuild from the test site to live

Status: **nothing has been pushed to live.** This is a checklist for planning that push. The existing guide for the mechanical copy is "How to promote a tested change to live" in the README. This document adds what is specific to the seven-stage rebuild.

## 1. Everything is additive

No existing record, field, route or page was converted, renamed or removed. The new fields below are all optional and default to empty. Loading a saved document in the Stage 7 build and visiting every page and project tab left the saved document identical to the Stage 6 build (apart from IDs generated at load), and the retained profit and pots figures were identical.

Stage 7 added **no** stored fields and **no** Settings keys.

## 2. New stored fields, by stage

**Stage 1** (records, tasks, Today): `project.jobType`, `.owner`, `.site`, `.tentative`; `task.scope`, `.refs`, `.recur`, `.spawnedId`; `settings.bizAccess`, `settings.todayLimit`.

**Stage 2** (buying, deliveries): `project.dropState[drop].check`, `.ptc`; `order.pc`, `order.receipts`, `order.items[].hire`; quote line `.hire`, `.hireSupplierId`; `task.autoKey`; `settings.varianceThresholdPct`.

**Stage 3** (selling): lead, sale and project `estDays`, `phases`, `prefStart`, `deadline`, `jobTypeId`, `qa`, `qRate`, `lost*`; contact and company `lifecycle`; quote `overrides`; price `leadTimeDays`, `validUntil`; `state.jobTypes`, `state.lifecycle`, `state.qualQuestions`; `settings.qualGateDefault`, `followUpGapDays`, `followUpTaskName`, `noContactDays`, `approverScope`; a "Stalled" lost reason. (`settings.followUpDays` is kept but no longer used.)

**Stage 4** (planning): `state.holidays`, `state.phaseTemplate`, `state.people`; `settings.workingWeek`, `settings.leadWeightPct` (default 20); phase `hours`, `start`, `end`, `selling`, `done`; `project.tentative.prev.phases`.

**Stage 5** (money foundations): `transaction.costClass`, `.costProjectId`, `.classHow`, `.classAt`, `.classBy`; `state.businessCosts`; `settings.bizCostsForOverheads`, `settings.pot*Method`, `.pot*Fixed`, `.pot*From`, `settings.toolCostOnJobs`; `asset.usageCharge`, `.usageAfter`; plan item `.hireCost`, `.uses`; `project.toolUse`.

**Stage 6** (finance pages): payment line and variation `writtenOff`, `landedTxn`; drop state `paidTxn`; `state.reviewMarks`.

**Stage 7**: none.

Browser-only (never in the saved document, per device): menu mode, favourites, collapsed side panels, chosen table columns.

## 3. Behaviour that depends on existing live data

These change what people see on first load, even though no stored value changes.

1. **Project Pipeline stages.** Six stages are worked out from confirmed milestone dates. A project's stored stage is untouched, but the board may show a project in a different column than before.
2. **Planned against actual dates** (from the earlier Lynton fixes) already applies; the "Check existing projects" card appears on live data the first time.
3. **Working days.** Durations, complete dates, follow-up gaps and days-since-contact now skip weekends and the bank holidays in Settings. A computed date can differ from what live shows today for the same inputs. No typed date is rewritten.
4. **Qualification gates are a hard gate by default.** Existing leads whose hard-gate questions are unanswered cannot be promoted until answered (no override). Check the questions and the mode in Settings, Selling before go-live.
5. **Customer lifecycle** is worked out from the old tags and deals, not stored, until someone sets it by hand.
6. **Lost projects leave the forecast.** Planned lines never invoiced on projects already closed as lost stop counting, so the forecast may move on purpose. Raised unpaid invoices stay owed until a confirmed Write off.
7. **Classify.** Existing money-out transactions have no class. One rolling task on Today counts them. Suggestions are never stored until accepted.
8. **Duplicate automatic tasks.** Before Stage 5 the automatic task key was dropped when a document loaded, so older automatic tasks may exist twice. The Business tasks page lists them; nothing is deleted automatically.
9. **Business tasks and costs visibility** defaults to Lynton and Royce. Mike and Gerry will not see those pages until ticked in Settings.
10. **Confirmed receipt prices** feed "Margin now" and job cost on the project Money tab; quote prices never change.
11. **Phase template pre-fill** applies only to new leads and deals. Existing jobs change only by pressing Apply the template.
12. **Pricing Model overheads** keep using the five yearly lines until someone presses "Use this list for the Pricing Model overheads" on Business costs and confirms.
13. **Approver access** is built but not switched on: no user or login exists for it.

## 4. Back up first

- Export a JSON backup from the live site (Settings, backup) and keep it somewhere that is not the repository.
- Copy the live row (row 1 of `tracker_data`) to a spare row or file in Supabase before the push.
- Keep a copy of the current live `index.html` (the commit hash before the push is enough).
- Note the live ENV block values (`LIVE`, `DOC_ID 1`, empty `STORAGE_PREFIX`) so they can be checked after copying.

## 5. Order of a test to live push

1. Refresh test row 2 from live row 1 (copy `doc`, as described in the README), so the test site holds today's real data.
2. On the test site, load that data, visit every page and every project tab, and compare the retained profit, pots, cash flow and bank balance with live. They should be identical.
3. Walk the Stage 7 test list (menu, More menu, templates, old Mark paid warning, phone and tablet, delivery sign-off one-handed, reports, monthly summary).
4. Check the section 3 items against real records: promotion gates on real leads, the Project Pipeline columns, lost projects in the forecast, the Classify count.
5. Confirm Mike and Gerry's and Lynton's access settings (Settings, CRM and tasks; approver scope).
6. Copy `index.html` over the live repo's file, then restore the ENV block to live values (`ENV_LABEL 'LIVE'`, `DOC_ID 1`, `STORAGE_PREFIX ''`). Search the file for `ENV_LABEL`, `DOC_ID` and `bt-test-` before committing. The amber banner and `[TEST]` title must not appear.
7. Push at a quiet time. Everyone logs in again only if the storage prefix is wrong; it should not be.
8. After the push, open live as an admin and check Today, Dashboard retained profit, Cash flow and one project. Do not save anything until those look right.

## 6. Things that could surprise live data

- A new build writes the new optional fields to the live document the first time anyone saves. An older build loading that document later may not keep them, so **rolling back after people have used the new build can lose what they entered in the new fields.** Keep the backup from section 4 and roll back before anyone saves if a problem shows.
- Only one person should be editing during the first hour; the conflict guard stops a stale browser overwriting a newer save, but a reload is needed.
- The Landed button and the old Mark paid button do different things: Landed ties a payment to an existing bank transaction, the old button creates a receipt. Choosing the old one when the bank line already exists double counts; the dialog now warns.
- The simple Balance sheet and the Profit and loss are labelled as simple views. Check them against what Mike sees in the accounts before relying on them.
- Test-only items must not travel: the amber banner code is harmless when `ENV_LABEL` is `LIVE`, but `DOC_ID 2` and the `bt-test-` prefix must never be left in the live file.
