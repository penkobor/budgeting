# BUDG-012 — 2026-04-27 — bugfix-opening-and-oneoff-candidates

*Part of [[BUDG-012]]*

## Issues reported by user
> я заметил что в первый раз когда я вышел за бюджет мне вылезло это окно
> для rebalance а потом уже перестало вылазить
> ... можешь там побольше следующих трат показывать с которых можно
> списать эту трату

## Root causes

### 1. Rebalance trigger silently skipped when no `monthly_openings` row
The trigger guard required `goal && opening && ...`. `useMonthlyOpening`
returns `null` when there's no anchor row in `monthly_openings` for the
relevant month (or any earlier month). MonthLens itself uses
`opening?.opening_balance ?? 0` and renders the goal card fine — so the
projection check appeared to "work" visually but Save was silently
skipping the rebalance step.

After the first rebalance, the user's projected end balance hovered close
to the goal but stayed within tolerance for many subsequent expenses, so
they didn't see the dialog again. Even when an expense pushed below the
goal, if `monthly_openings` had no row, the guard skipped step 2.

### 2. One-off planned expenses not in candidate list
`listFuturePlannedExpenses` only iterated `recurring_rules`. Manually
added future-dated planned expenses (rows in `transactions` with
`occurred_on > today` and negative amount, no `recurring_rule_id`) were
invisible to the rebalance step — even though they're real planned
expenses the user might want to trim.

## Fixes

### 1. Drop `opening` guard
`AddTransactionDialog.tsx` now uses `opening?.opening_balance ?? 0`,
matching MonthLens convention. Trigger fires whenever a goal exists for
the month, not requiring an anchor row.

### 2. Extend `listFuturePlannedExpenses`
New optional `transactions: Transaction[]` argument. The function now
returns:
- recurring rule occurrences within the future window (with overrides applied)
- one-off `transactions` rows in the future window with negative amount and no `recurring_rule_id`

`PlannedOccurrence` gets `isOneOff?: boolean` and `transactionId?: string`.
For one-off rows, `ruleId = 'tx:<txId>'` so the occKey stays unique.

### 3. RPC v2: handle one-off updates atomically
Replaced `apply_rebalance(tx, overrides)` with `apply_rebalance(tx, overrides, tx_updates)`.
`tx_updates` is `[{id, new_amount}]`:
- `new_amount = 0` → DELETE the planned tx
- `new_amount > 0` → UPDATE `transactions.amount = -new_amount`

All three operations (new tx insert, overrides upsert, planned-tx mutate)
run in the same PL/pgSQL block — single Postgres transaction, atomic.

Old 2-arg signature dropped to avoid ambiguous overloads.

### 4. Client-side wiring
- `RebalanceSelection` gets `isOneOff` + `transactionId` fields.
- `buildSelections` carries those through.
- `applyRebalance` splits selections: recurring → `overrides[]`,
  one-off → `tx_updates[]`. Single RPC call.

## Verification
- `npm run build` PASS.
- Migration applied via MCP; supabase advisors clean (no new warnings).

## Outcome
Both reported bugs fixed. Rebalance now triggers reliably for any
over-goal expense in a month, and the candidate list includes both
recurring occurrences and one-off planned expenses.

Polish (alert ribbon, override badges on Recurring page, success toast,
unit tests) still under Phase 5.
