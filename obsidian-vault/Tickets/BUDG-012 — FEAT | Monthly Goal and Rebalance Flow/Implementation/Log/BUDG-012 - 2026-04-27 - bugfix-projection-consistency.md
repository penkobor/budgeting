---
ticket: BUDG-012
date: 2026-04-27
session: bugfix-projection-consistency
---

*Part of [[BUDG-012]]*

# Bugfix — projection / running-balance / rebalance trigger consistency

User reported (paraphrased, RU): "ledger and Month projected end give different
totals; the rebalance trigger seems to use a different number than what's
displayed somewhere — feels like one place uses the balance *before* today's
spending and another uses the balance *after*."

## Root cause — two independent inconsistencies

### Issue 1 — `computeProjectedEndBalance` skipped past-but-unrealised recurring

`projection.ts` projected only from `max(today, monthStart)` onward for
recurring rules. The rest of the app (Ledger running balance, MonthLens
series, TodayLens balance, ForecastLens, PlanLens) projected the **whole
month**, including past dates whose recurring occurrence hadn't yet been
materialised into a transaction.

Concrete repro: rent rule on the 1st of the month, today is the 27th, no
transaction created for the 1st →
- Ledger running balance: subtracts rent
- MonthLens projected end (`series.totals.projectedEnd`): subtracts rent
- `computeProjectedEndBalance` (used by goal trigger + alert ribbon): does
  NOT subtract rent

Difference can be huge (rent-sized). Made the goal trigger fire less often
than the visible "over by N" status would suggest, and made the alert
ribbon disagree with MonthLens.

### Issue 2 — Lens balance code didn't apply `recurring_overrides`

After Phase 4 the rebalance flow writes to `recurring_overrides`, but every
lens (Ledger, MonthLens, TodayLens, WeekLens, ForecastLens, PlanLens) was
still expanding rule occurrences with the full `r.amount`, ignoring
`amount_override` and `skipped`. Result: trim a rent payment via rebalance →
projection updates correctly via the alert ribbon (which uses
`computeProjectedEndBalance`, which DID honour overrides), but Ledger and
MonthLens still show the un-trimmed amount, so the user sees stale balances
and the goal status flickers between sources.

## Fixes

### `src/lib/projection.ts`
- Project recurring occurrences across the **whole month** (`monthStart →
  monthEnd`), not just `today → monthEnd`.
- `today` parameter renamed to `_today` and marked unused, kept for
  back-compat. Could be removed in a future refactor.
- Comment block explains why past-unrealised occurrences are still
  included.

### Lens consistency (Ledger, MonthLens, TodayLens, WeekLens, ForecastLens, PlanLens)
- Added `useRecurringOverridesInRange(fromIso, toIso)` query to each lens
  that previously expanded rules without checking overrides.
- Replaced direct `r.kind === 'income' ? r.amount : -r.amount` with
  `effectiveOccurrenceAmount(rule, date, overrides)` everywhere. The helper
  returns `null` for skipped occurrences (caller drops them) and the signed
  effective amount otherwise.
- Added `overrides` to the `useMemo` dependency arrays.

## Tests

`src/lib/projection.test.ts` — added 4 regression tests covering
`computeProjectedEndBalance`:
- past-but-unrealised recurring is included (rent on 1st, today is 27th, no
  tx → projection drops by rent)
- realised tx for that occurrence is NOT double-counted
- `skipped: true` override removes the occurrence from projection
- `amount_override` reduces the occurrence to the overridden amount

All 11/11 tests pass.

## Validation
- `npm test` 11/11 PASS (264ms)
- `npm run build` PASS

## Files touched
- `src/lib/projection.ts` (project from monthStart, _today)
- `src/lib/projection.test.ts` (4 new tests)
- `src/pages/Ledger.tsx`
- `src/pages/lenses/MonthLens.tsx`
- `src/pages/lenses/TodayLens.tsx`
- `src/pages/lenses/WeekLens.tsx`
- `src/pages/lenses/ForecastLens.tsx`
- `src/pages/lenses/PlanLens.tsx`
