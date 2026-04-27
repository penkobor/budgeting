---
ticket: BUDG-012
date: 2026-04-27
session: phase5-polish
---

*Part of [[BUDG-012]]*

# Phase 5 polish — alert ribbon, badges, toast, tests

Closing out BUDG-012 with the smaller UX details that didn't make Phase 1–4
but were on the plan from the start.

## What changed

**Dashboard goal-exceeded alert ribbon** (`src/components/GoalAlertRibbon.tsx`)
- New component mounted at the top of `Dashboard` (above the lens body, below
  the period switcher).
- Reads the current month's goal + opening + transactions + rules + overrides,
  computes projected end-of-month balance via the existing
  `computeProjectedEndBalance` helper.
- Renders only when there is a goal **and** projection < goal.
- Visible across Today / Week / Forecast / Plan lenses; suppressed on Month
  because `MonthlyGoalCard` already shows the same status with more detail.
- Tapping "Review" deep-links to `/?lens=month` so the user can edit the goal
  or jump into the rebalance flow.

**Trimmed badge on Recurring page** (`src/pages/Recurring.tsx`)
- New hook `useUpcomingRecurringOverrides()` in `queries.ts` fetches all
  overrides with `occurrence_date >= today`.
- Recurring page groups overrides by `recurring_rule_id` and shows an inline
  pill next to the rule name: `Nx trimmed` / `Nx skipped` / `Nx adjusted`
  (mixed). Title attribute spells out the breakdown.
- Helps the user see at a glance which fixed payments have been adjusted by
  the rebalance flow without opening individual months.

**Toast on rebalance apply** (`src/components/ui/Toast.tsx`)
- Added a tiny zustand-backed toast store + `<ToastHost />` renderer mounted
  in `App.tsx`. No new dependency — reuses zustand and framer-motion which
  are already in the bundle.
- Imperative `pushToast(message, tone)` so non-component code (mutation
  callbacks) can fire toasts.
- `AddTransactionDialog.applyRebalance` now calls
  `pushToast('Saved · trimmed N planned expenses to keep your goal')` after
  the RPC resolves, giving immediate feedback that the rebalance was applied
  before the dialog closes.

**Vitest setup + distribution math tests** (`src/lib/projection.test.ts`)
- Added vitest + jsdom as dev deps; added `test` and `test:watch` scripts.
- Switched `vite.config.ts` to `vitest/config`'s `defineConfig` so the
  `test` block typechecks alongside the regular Vite config.
- 7 unit tests covering `distributeEvenly`:
  - zero overage → no deltas
  - empty pool → everything left over
  - even split across equal-cap items
  - small-item cap hit → overflow redistributed to larger items + excluded
  - insufficient pool → leftover reported
  - cent-rounding stability (0.10 split across 3)
  - per-item delta never exceeds item cap
- All 7 pass.

## Validation
- `npm run build` PASS (no TS errors, bundle generated)
- `npm test` 7/7 PASS in 109ms
- Supabase advisors: no new warnings

## Known follow-ups (deferred)
- Could surface the alert ribbon counts/details on /ledger and /recurring
  routes as well — for now it's Dashboard-only.
- Toast could grow into a generic notification surface (deletion confirms,
  import success, etc.) — leaving the API minimal until there's a second
  caller.
- Tests cover pure math only; the dialog flow itself is still e2e-untested.

## Files touched
- `src/components/GoalAlertRibbon.tsx` (new)
- `src/components/ui/Toast.tsx` (new)
- `src/lib/projection.test.ts` (new)
- `src/pages/Dashboard.tsx`
- `src/pages/Recurring.tsx`
- `src/components/AddTransactionDialog.tsx`
- `src/hooks/queries.ts`
- `src/App.tsx`
- `package.json`
- `vite.config.ts`
