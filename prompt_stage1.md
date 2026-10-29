# Business Tracker rebuild, Stage 1: menu, record pages, tasks and Today

Work in the TEST repo only (Royce-BCR/business-tracker-test, single file index.html, Supabase row id 2). Never write to the live repo or the live row (id 1). This is a large piece of work, so do it as the seven steps below, in order. Commit and push after each step with a clear message, self-test each step in the browser (desktop, tablet and phone width) before moving on, and give me a short plain-English summary after each step. Keep going between steps unless something unexpected happens.

## Rules
- Stop and tell me before changing login, Supabase config, the ENV banner, or reshaping stored data. If a step would need existing records converted or any stored field renamed or removed, stop and describe it first.
- Any new stored field must default safely, so existing data loads unchanged.
- Do not overwrite or alter financial records. Do not change any accounts (keep the Harvey and Auro accounts as they are). Do not change the Tortworth supplier settings (£62.50 / £2,500 ex VAT).
- Reuse the existing design tokens, tables, side panels, `data-nav` links and the nav stack with Back. No new dependencies.
- Nothing typed twice: where a value is already held somewhere, show it and link to where it is edited.
- Everything links both ways, and Back returns to the previous view.

## Before step 2: read, then report
Read the existing code for: the menu and nav, project, contact, company and supplier pages, tasks and Actions, Setup and Admin, the Today view, the Gantt on the project page, `nextMilestone` / `projNextMs`, `autoProjectStageId`, and how timeline notes are stored. Write me a short note (what you found, what you propose, risks to existing data). Then continue without waiting, unless something could lose data.

## Step 1: The new menu
Regroup the existing pages. Do not remove, hide or rename any page beyond what the grouping needs. Keep favourites and the collapsible menu. Pages that do not exist yet are not shown; later stages add them.

- Command: Today, Dashboard
- CRM: Contacts, Companies, Projects, Tasks
- Commercial (selling): Lead Pipeline, Sales Pipeline, Quotations, Invoicing (customer invoices)
- Operations (buying and delivering): Project Pipeline, Suppliers, Purchase orders, Assets
- Finance: Cash flow, Transactions, Bank Reconciliation, Pricing Model, Revenue Forecast
- Business: Business plan (Business tasks arrives in step 4)
- Settings: a single item at the bottom

Pages in the old menu not listed above (for example Approvals) stay exactly where they are until their own stage. If a page does not fit, leave it where it is and tell me.

## Step 2: The record page frame (Project first)
One layout for every record, built first for a Project. Three columns, collapsing to one column on phone width.

**Left: the profile.**
- A pinned header that stays at the top of the left panel while it scrolls: initials avatar, name, a subtitle (reference, quote, customer), status pills, and quick actions (Note, Task, Log time, Call).
- Every section below is collapsible (open by default).
- Every value is shown as a field, and the field says what you can do with it:
  - Locked (greyed, never changes): reference.
  - Calculated, read-only (greyed, with a line saying where to change it): value ("Edit the value in Quote Q-xxx", linked), margin shown as two boxes, Sold and Now, agreed date (blank until the contract is marked agreed), hours planned, hours logged.
  - Editable: pipeline and stage (dropdowns, at the top of About this project), job type (free text), owner, source, start date, complete date, duration, site details, customer contact details.
- Sections: About this project, Dates and workload, Money (billed, paid, overdue, read-only), Customer and contact, Site (address, access, services, last visited). New fields default empty.
- Start, complete and duration are linked and count working days: change start or duration and complete moves, change complete and duration follows.
- Do not show a "Next" field unless it equals the next stage.
- Project Pipeline stages: Planning, Materials, On site, Sign-off, Invoiced, Completed. If existing projects sit in a stage that would disappear (such as Confirmed), stop and tell me before remapping anything.
- Editing: when you click off a changed field, a bar appears at the foot of the left panel. For non-date edits: Save update or Cancel. For any date edit: Confirm and update project, Tentative change, or Cancel. Nothing in any linked record changes until the schedule is confirmed (see step 7).

**Centre: one-line tabs** (underlined, left-aligned, scrolling sideways if short of space, not pills). Build Overview, Activity and Plan now. Money and Materials and deliveries arrive in later stages, so do not show them yet.
- The centre scrolls on its own while the profile header and tab bar stay fixed. Only Overview has the pinned headline strip: sales value, status, next on site, overdue, next invoice.
- Overview holds: the headline strip, an Outstanding block (waiting on us, waiting on others), tiles for Suppliers and Invoices, and a Qualification tile (the score and the answers, carried from the lead stage where they exist).

**Right: linked records** (built in step 3).

## Step 3: Associations and the other record pages
Build a view over the links that already exist (no new tables unless a link truly does not exist).
- Right column on a Project: tiles for Customer, Suppliers, Quotes, Orders, Invoices. Each row shows the record with its status or date, and every name is a link to that record. Back returns to the project.
- Then the Supplier record page (profile left; right: its projects, orders and invoices) and the Customer record page for contacts and companies (right: projects, quotes, invoices). A company shows its people, and a person shows their company if any.
- Same layout, same field rules, same collapsible sections, as step 2.
- Where the current CRM holds anything beyond customers and notes (for example referrers or marketing lists), list it for me in the step summary rather than moving it.

## Step 4: Task engine and Business tasks
- Tasks are standalone records: title, due date, assignee, status, type (job or business), notes, and the record they attach to (project, customer, quote, order, supplier).
- One task form with recurrence and assignee, used everywhere.
- A Tasks hub (CRM, Tasks) with filters by person, customer, project, due date and type.
- Record-level task lists in the centre of each record.
- Merge the Actions page and Setup and Admin into one Business tasks page (Business group). Existing Tasks and Actions are carried across, not lost. If this needs a stored-data conversion, stop and describe it first.
- Business tasks and business costs are visible to Lynton and Royce by default. Add a setting for who else can see them (Mike and Gerry when they have logins). An admin adjusts it per user.

## Step 5: The activity feed
On the Activity tab of every record:
- A one-line strip of the nine key milestones (contract signed, design signed, materials ordered, materials delivered, on site, build complete, invoiced, paid, sign-off), each marked done, next or to come, using the existing `nextMilestone` logic. Cards and stages move on confirmed dates, never planned dates.
- The feed is a view over real records, not copied text. Notes, tasks, quotes, deliveries, invoices and payments each show as their own card with type, date and owner, editable in place where that makes sense (notes edit, tasks tick), and with a link to the record's own page.
- Ordering is automatic: open tasks on top, oldest due date first, with overdue ones highlighted. Below them, the history, newest first. A task ticked off leaves the top and drops into history on its completion date. There is no separate "pinned" box.
- Existing timeline notes must appear in the feed unchanged. Do not convert or move stored notes without telling me first.

## Step 6: Today
- A day view with previous and next arrows and a date picker. The time-critical block comes first, then two action tiles: job actions and business actions. Business actions follow the visibility setting.
- Items without a date appear in an Undated group.
- List length is a setting, default 10 per tile, with a See more link.
- Each item links to its record, and open items can be ticked off from here.

## Step 7: The Plan tab and the reschedule flow
- Keep the existing Gantt as the phase timeline on the project's Plan tab. It stays on every project page.
- Date changes from the left panel land here. When Confirm and update project or Tentative change is chosen, show every linked date in order (on-site start, deliveries, invoice dates, build complete, sign-off) shifted by the change, each editable, with the old date shown. Delivered items stay as they are.
- Three outcomes: Confirm schedule (the project dates, deliveries and invoices follow the new dates), Keep as tentative (dates flagged Tentative until confirmed), Cancel changes (everything reverts).
- If the new dates overlap another project's dates, warn and name the other project, so I know who to speak to first. Suggest Tentative in that case.
- A later stage adds capacity, so for now the overlap check just compares project dates.

## Settings added in this stage
Today list length (10). Who can see business tasks and costs (Lynton, Royce).

## Test list to run on test before you finish
1. Every page that existed before is still reachable from the new menu, in its new group.
2. Open a project, click a supplier, edit a detail, press Back and land where you were. Open that supplier and see its orders, invoices and projects.
3. Locked and calculated fields cannot be edited and say where to edit them. Change job type and owner, and the bar offers Save update or Cancel.
4. Change the start date: complete and duration follow, the bar offers Confirm, Tentative and Cancel, and nothing in linked records changes until you confirm on the Plan tab. Cancel puts everything back.
5. Create a job task and a recurring business task. The job task appears at the top of the project's activity feed, and on Today for its date. Tick it and it drops into history.
6. Sign in as, or simulate, a user who is not Lynton or Royce, and confirm business tasks are hidden.
7. Step to tomorrow and back on Today, jump to a date, and confirm undated items appear.
8. Existing timeline notes, tasks and Actions all still appear, with nothing lost.
9. The tab bar and pinned headers stay fixed while the centre scrolls, and the layout works at tablet and phone width with large enough touch targets.

## Finish
Give me one plain-English summary: what changed per step, what you chose not to do and why, anything I need to check, and anything you found in the existing code that affects the later stages (orders and deliveries, selling, planning and capacity, money). Do not start stage 2.
