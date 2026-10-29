# Stage 5, step 1: how money is taken today (read from the code, nothing changed)

Order, per project, as `projRetained()` and `retainedTotals()` do it:

1. **Job price**: the as-sold contract (ex VAT) plus approved variations. No quote: the agreed value.
2. **Less job costs**: the Working plan's materials, delivery and labour cost (labour price divided by 1 + the labour profit %). This is "Margin now". No quote: actual cost, else budgeted cost.
3. **Less unplanned costs**: transactions linked to the project that did not complete a planned item (`projActualCost().unplanned`). This is the project profit.
4. **Less profit share**: hours x GBP per hour, or labour cost x %, with a per-project override. This is Lynton's income.
5. **= Retained profit** for the project.
6. **Recognised as invoiced**: retained profit x the invoiced share of the project's payment lines = "Retained profit to date" (`toDate`).
7. **Shared into the pots**: Assets 30, Tax 25, Buffer 20, Growth 25 (Settings, scaled to 100 if they do not add up) of the to-date figure.

Not part of the retained profit chain at all:

- Business overheads: the five yearly Pricing Model lines (`totalOverhead()`) and transactions of category Overhead. They only reach the cash flow forecast (a "Fixed overhead" row, less what was already paid that month) and the Pricing Model's overhead per day.
- The asset plan: approved, ordered or bought items are only shown as "committed" and "unallocated" on the Dashboard pot. Nothing is subtracted from the pots.
- Bank reconciliation: changes the bank position and locks months. It does not touch profit.
- Transaction category (TXN_CATS): matters to profit only where a transaction carries a project link.

Result: nothing comes out ahead of the retained profit number except job costs and the profit share, which matches the decision. The one thing to know is the plan's waterfall picture shows "less business costs" before the profit share; the code takes no business costs out anywhere before the pots.
