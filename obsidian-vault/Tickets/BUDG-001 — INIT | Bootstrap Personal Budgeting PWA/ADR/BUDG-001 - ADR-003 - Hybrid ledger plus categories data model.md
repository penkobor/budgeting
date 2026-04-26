# BUDG-001 — ADR-003 — Hybrid ledger plus categories data model

**Ticket:** [[BUDG-001]] — Bootstrap Personal Budgeting PWA
**Date:** 2026-04-26
**Status:** Accepted
**Supersedes:** none

---

## Context

The user's existing budgeting workflow lives in Numbers and has two distinct surfaces:

1. **Fixed Payments table** — list of recurring expenses (rent, subscriptions, loans) with amount and day-of-month
2. **Monthly daily ledger** — one row per day of the month, columns for spending / income / balance, with a **running balance** that anchors to a manually-entered opening balance and updates as transactions are added

The model needs to express both, plus support **forecasting** (showing the projected end-of-month balance assuming all recurring rules fire as scheduled, so the user can see "am I on track?" before the month is over).

Most off-the-shelf budgeting apps use either:

- **Pure category-based** (YNAB, Monarch) — buckets you allocate into, no native concept of running balance
- **Pure ledger-based** (plain spreadsheet) — chronological list of transactions, no categorisation or recurrence

Neither alone matches the user's workflow.

Constraints:
- Must produce a daily running balance for any month
- Must support recurring rules with monthly / weekly / yearly / custom-interval frequencies
- Must distinguish **planned** transactions (recurring rule projection) from **actual** (confirmed) so forecast and reality both display
- Must support categorisation for analysis without forcing the user to allocate budget per category up-front

---

## Decision

Use a **hybrid model**:

- **`transactions`** is the source of truth — every income or expense is a row with a **signed amount** (negative = spend, positive = income), an `occurred_on` date, and a `category_id`. Running balance for any day is computed as `monthly_opening + sum(transactions where occurred_on ≤ day)`.
- **`recurring_rules`** define the *template* for repeating transactions (frequency, amount, category, day-of-month/week/etc). They do NOT auto-create transaction rows; instead the `expandRuleInRange(rule, from, to)` helper projects them on demand.
- **`monthly_openings`** stores a per-month starting balance the user can override (e.g. paycheck moved between months, manual reconciliation with bank).
- **`categories`** are flat (no hierarchy), with a `kind` of `expense` or `income` and a colour for charts.
- **Planned vs actual**: a transaction has a `planned: boolean` and `confirmed_at: timestamptz`. Recurring rule projections render as `planned=true` rows in the Ledger UI with a "Confirm" button that sets `confirmed_at = now()`. The Dashboard chart shows two series: `forecast` (all transactions including planned) and `actual` (only confirmed + past).

This way the **ledger surface** (running balance per day) and the **categories surface** (where did money go) both fall out of the same `transactions` table, and **forecasting** is a query, not a separate model.

---

## Consequences

### Positive
- One source of truth (`transactions`); running balance is derivable, never stored out of sync.
- Categories are optional metadata — user can add new ones without restructuring data.
- Recurring rules don't pollute the table with future-dated rows the user might never confirm; projection is always accurate to the current rule definition.
- Forecast vs actual is a trivial filter (`confirmed_at IS NOT NULL`), no parallel "budget" table.
- Mirrors the user's mental model from Numbers (rows + running balance + recurring template).

### Negative
- Daily running balance requires a sum query per day; for a year of transactions this is fine, but at >10K rows would need an index or a materialised view.
- Recurring rules are not "real" transactions — if the user wants to see them in the ledger they must be projected client-side. Adds complexity to the Ledger render logic.
- Editing a recurring rule retroactively does NOT affect already-confirmed transactions (which is correct, but might surprise the user).

### Neutral
- No envelope / budget allocation per category (YNAB-style). User can add `monthly_budgets` table later if wanted, without changing existing tables.
- Multi-currency would require adding `currency` to `transactions` and a conversion table — clean addition, no schema breakage.

---

## Alternatives considered

### Option A — Pure category-based (YNAB-style envelope budgeting)
- Pros: Strong opinion on "give every dollar a job"; great for users who want to actively budget.
- Cons: User explicitly does NOT want envelope-style allocation; wants to *track* against an existing pattern, not be told to allocate.
- Rejected because: doesn't match the workflow.

### Option B — Pure ledger (no categories, no recurring rules — just transactions)
- Pros: Simplest possible model; closest to a literal spreadsheet.
- Cons: No forecasting; no analytics on where money goes; user has to manually re-enter the same recurring expenses every month.
- Rejected because: misses two of the three explicit user requirements (forecast, recurring).

### Option C — Pre-materialise recurring rules into `transactions` rows for the next 12 months
- Pros: Single uniform table; ledger render is a straight SELECT.
- Cons: Editing a rule means deleting and recreating future rows; two months from now if the user changes the rent amount we need to rewrite history; risk of dangling planned rows for inactive rules.
- Rejected because: state divergence risk; on-demand projection is cleaner and cheaper.

### Option D — Separate `planned_transactions` and `actual_transactions` tables
- Pros: Clear physical separation of forecast vs reality.
- Cons: Doubles the surface area; "confirm a planned transaction" becomes a cross-table move; reporting joins are uglier.
- Rejected because: a single `planned: boolean` column achieves the same separation with one-tenth the schema.

---

*Part of [[BUDG-001]]*
