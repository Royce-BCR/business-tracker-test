# Stage 6, before step 1: what the code does today (read only, nothing changed)

## What I found

- **Cash flow forecast** (`computeCashFlow`): per month, actuals come from transactions on the day cash moved; the forecast adds only what is not settled: unpaid customer payment lines (`p.paymentLines`, approved variations), supplier payments from the quote's delivery drops (`qAllCashItems`, once a drop is paid it leaves), stage-cost materials, weighted pipeline, business costs list, the evenly spread overhead rows, the asset plan. An unsettled item whose date has passed sits in the current month. The starting point is the real bank balance (`bankBalance`).
- **Projects marked closed lost** (`p.lost`) are not looked at by the forecast, `finLines` or the invoice list at all. Their unpaid lines still count today. Nothing else treats "cancelled" for a project; an order has its own `Cancelled` status.
- **Customer invoices**: the payment lines and approved variations (`invRows`). Money owed is a line with an `invoicedDate` and no full `paidDate`. A raised invoice has a due date, so days late is read from it. Amounts include VAT when VAT is on (Settings).
- **Bank reconciliation**: accounts, loans (balance per month), monthly statement balance, matched lines, locked months. Book balance = starting balance plus transactions from the starting date (`bankBalance`).
- **Recognition rule**: a project's retained profit is recognised in proportion to the share of its payment lines that have an invoiced date (`projInvoicedShare`). Revenue "as invoiced" is therefore the job price (contract plus approved variations, ex VAT) times that share. Job costs, profit share and retained profit are recognised at the same share. The waterfall and the P&L can use the same maths month by month and add up to exactly `retainedTotals().toDate`.
- **Overhead per day** (`overheadPerDay`): yearly overhead divided by working days a year. Yearly overhead is the five Pricing Model lines, or the Business costs list once "Use this list for the Pricing Model overheads" is on.
- **Dashboard "Cost of selling"**: `sellRows` / `sellRate`, hours on selling phases times the labour rate. It is a card on the Dashboard today.
- **Classify** (stage 5): `costClass` on money-out transactions; the unclassified count is `clsNeeds`.
- **Tasks**: `createTask` with `autoKey`; stage 5 fixed the autoKey being dropped on load, so older automatic tasks made before that fix can exist twice.

## What I propose

1. Lost projects: unpaid, not-invoiced lines are skipped by the forecast and money lists with a marker; raised unpaid invoices stay as owed until a new **Write off** (confirm, date, reason); unpaid supplier payments stay unless that order is cancelled.
2. New optional stored fields only: `line.writtenOff` / `variation.writtenOff` ({date, reason, by, amount}), `state.reviewMarks` (weekly review Landed / Late / Moved, keyed by item), `line.landedTxn` (see risks).
3. Every finance page and report reads from the existing functions (`finLines`, `invRows`, `computeCashFlow`, `retainedTotals`, `potPositions`, `bankBalance`, `bcMonthly`). Nothing typed twice, every figure a link.
4. Overhead recovered through pricing: `overheadPerDay()` times project days in the month. Project days can be read from the Working plan labour days, spread over the project's start and complete dates. If a project has no dates or labour days it is left out and the page says so.

## Risks to existing data

- **Landed on a customer payment, with an existing transaction.** The existing "Mark paid" always creates a receipt transaction, which would double count if the bank line is already in Transactions. To avoid changing any transaction, Landed will store the link on the payment line (`landedTxn`), and the receipt-sync code will skip a line that has one. No transaction is edited or added in that case. If nothing matches, Landed opens the existing "Complete receipt" dialog.
- **Moved** edits the due date on the line or cost, the same field that is typed on Customer invoices today. A line locked by an invoice document stays locked (the page says so).
- **Write off** adds a dated record and takes the line out of money owed. The invoice itself, its invoiced date and the retained profit recognition do not change.
- **Forecast changes**: only projects already closed lost, and only for unpaid, not-invoiced lines. If any exist, the forecast will move on purpose.
- Nothing needs converting, renaming or removing, so no stop is needed.
