# BUDG-022 - 2026-04-28 - phase1-shared-lens-scaffold

*Part of [[BUDG-022]]*

## Session goal

Phase 1 from [[BUDG-022 - Plan]]: scaffold a read-only **Shared Lens** in the owner app that mirrors the data shape of `/share/:slug`. No DnD yet — the goal is to confirm the grouping logic matches the public page exactly so subsequent phases (drag, slider, commit via `apply_rebalance`) can plug in cleanly.

## What landed

- New file [src/pages/lenses/SharedLens.tsx](src/pages/lenses/SharedLens.tsx):
  - `useShareLink()` for the public URL banner.
  - `useTransactionsInRange(currentMonthStart, +6 months end)` filtered client-side to `is_shared = true`.
  - `useRecurringRules()` filtered to `is_shared = true && active`, expanded with `expandRuleInRange(today, horizon)`.
  - Same month-grouping + sort + cutoff rules as `PublicShare.useMonthGrouping`, just typed against `Transaction` / `RecurringRule` rather than the JSON payload.
  - Each entry carries `source: 'tx' | 'recurring'` + `sourceId` + (for recurring) `occurrenceDate` — these fields are unused in Phase 1 but pre-stage the Phase 2 commit payload (so we can pass them straight to `apply_rebalance`'s `tx_updates` / `overrides`).
  - Header card surfaces totals (income + expense), event count, month count, and the public URL when a share link exists.

- [src/pages/Dashboard.tsx](src/pages/Dashboard.tsx) — added a 6th lens chip "Shared" (`Share2` icon). URL: `/?lens=shared`.

## Decisions confirmed in code

- Lens visibility = "rendered inside Dashboard, which is behind the auth Gate". No extra owner check needed in the component itself; RLS scoping on `transactions` and `recurring_rules` already restricts the data to the current `auth.uid()`.
- Horizon = 6 months from today, matches PublicShare. Anything outside that range stays invisible until later phases need it (cross-month drop on a future month edge).
- No DnD wiring yet. The chip-on-the-right amount is a plain `<span>` for now — Phase 2 turns it into a `motion.div` with `drag`.

## Build / lint state

- `npm run build` passes (vite + tsc -b).
- No new lint errors. Pre-existing 12-problem baseline unchanged.

## Next session

- Phase 2: same-month transfer DnD. Plan order:
  1. Wrap each row's amount span in `motion.div drag dragSnapToOrigin`.
  2. On `onDragStart`, `useUi().setDraggingShare({ entry, monthKey })`.
  3. On `pointerEnter` of another row in the same month, render a `<input type="range">` slider beneath the chip.
  4. On `onDragEnd`, build `apply_rebalance` payload:
     - tx → tx: `tx_updates: [{ id: src.id, amount: src.amount - n }, { id: dst.id, amount: dst.amount + n }]`
     - tx → recurring (or vice versa): defer to Phase 4 — for Phase 2, only tx → tx in the same month.
  5. Toast on success, invalidate `['transactions']`.
