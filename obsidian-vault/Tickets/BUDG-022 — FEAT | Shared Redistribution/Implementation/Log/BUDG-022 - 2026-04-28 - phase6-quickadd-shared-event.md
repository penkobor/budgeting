# BUDG-022 - 2026-04-28 - phase6-quickadd-shared-event

*Part of [[BUDG-022]]*

## Session goal

Phase 6 from [[BUDG-022 - Plan]]: a standalone "Add shared event" entry point on the Shared Lens that doesn't require a drag source.

## Decisions (from interview)

- **Kind**: expense only. The button always inserts a negative-amount transaction. Income shared events stay creatable via the existing AddTransactionDialog (with the `is_shared` checkbox).
- **Category**: optional dropdown of expense categories (`kind !== 'income'`). `null` allowed.
- **Visibility**: the new tx is just a normal `transactions` row with `is_shared = true` — it shows up in the user's own Ledger / TodayLens / WeekLens / MonthLens / ForecastLens AND on the public `/share/:slug` page. There is no separate "shared-only" storage.

## What landed

- `+ Add shared event` button in the Shared Lens header (next to the running total). Opens `QuickAddSharedModal`.
- New component `QuickAddSharedModal` with fields: amount (numeric input, autoFocus), date (defaulted to today), description (optional, free text), category (optional select from `expenseCategories`).
- Confirm path posts to `redistribute_shared` with just `tx_inserts: [{ occurred_on, amount: -magnitude, description, category_id, planned: true }]`. No `tx_updates` / `override_upserts` since there's no source.
- `is_shared = true` is enforced server-side by the RPC (already since Phase 2), so the client doesn't need to set it.
- `category_id` is included in the payload for the first time. The existing RPC migration (`20260428_budg022_redistribute_shared_rpc.sql`) already accepts and stores it.

## Why expense-only

Most shared events the user describes are outgoing payments (gifts, dinners, hotel splits). An income-flavoured "I owe Pavel +500" is rare and already has the dropzone-pull-from-source flow covering it. Keeping the standalone button single-kind avoids a kind toggle in a small modal and matches the user's mental model.

## Build / lint state

- `npm run build` (vite + tsc -b) green.
- No new warnings.

## Manual smoke (to do)

1. Open Shared lens → click `+ Add shared event` in header.
2. Enter 500, leave date as today, description "Birthday gift", category "Gifts" (if exists).
3. Confirm → toast "Added shared expense 500 …".
4. Lens shows the new row in the current month with the right amount.
5. Open Ledger — same row exists with shared pill.
6. Reload `/share/:slug` — same row visible publicly.

## Next session

- Phase 5: long-press / bottom-sheet fallback for mobile DnD.
- Phase 7: optimistic updates + diff highlight after redistribute.
