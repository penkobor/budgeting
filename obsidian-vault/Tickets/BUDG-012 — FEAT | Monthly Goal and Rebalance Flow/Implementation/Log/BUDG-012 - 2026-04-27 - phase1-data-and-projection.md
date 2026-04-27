# BUDG-012 — 2026-04-27 — phase1-data-and-projection

*Part of [[BUDG-012]]*

## Goal for this session
Lay the data foundation: two new tables, type definitions, hooks, a pure
projection helper. No UI yet.

## Execution

### 1. Migration `budg012_monthly_goals_and_overrides`
Applied via Supabase MCP `apply_migration`.

- `monthly_goals (user_id, year_month, amount, ...)` — UNIQUE `(user_id, year_month)`.
  - `year_month` constrained to `^\d{4}-\d{2}$` (e.g. `'2026-04'`).
  - Full RLS — owner SELECT/INSERT/UPDATE/DELETE.
  - `updated_at` auto-bumped via `set_updated_at()` trigger.
- `recurring_overrides (user_id, recurring_rule_id, occurrence_date, amount_override, skipped, ...)`
  - UNIQUE `(recurring_rule_id, occurrence_date)`.
  - Indexed on `(user_id, occurrence_date)` and `(recurring_rule_id, occurrence_date)`.
  - CHECK: `skipped = true OR amount_override IS NOT NULL` — can't have an empty override.
  - Full RLS.

Local copy: [`supabase/migrations/20260427_budg012_monthly_goals_and_overrides.sql`](../../../../supabase/migrations/20260427_budg012_monthly_goals_and_overrides.sql).

### 2. Lint follow-up
Initial migration triggered `function_search_path_mutable` advisor for `set_updated_at`. Re-applied with `set search_path = public, pg_temp` — clean.

### 3. `db.types.ts`
Added `Tables.monthly_goals` and `Tables.recurring_overrides` definitions; new exports `MonthlyGoal`, `MonthlyGoalInsert`, `RecurringOverride`, `RecurringOverrideInsert`.

### 4. `src/lib/projection.ts` (new)
- `effectiveOccurrenceAmount(rule, date, overrides)` — applies skip / amount-override and returns signed amount (positive for income, negative for expense).
- `computeProjectedEndBalance(monthIso, openingBalance, transactions, rules, overrides, today?)` — sums opening + actual + future-unrealised recurring with overrides.
- `listFuturePlannedExpenses(monthIso, rules, overrides, today?)` — returns the candidate set the rebalance UI will list, sorted by date.

### 5. `src/hooks/queries.ts`
- `useMonthlyGoal(yearMonth)` — `.maybeSingle()` returns the row or `null`.
- `useUpsertMonthlyGoal()` — upsert by `(user_id, year_month)`.
- `useDeleteMonthlyGoal(yearMonth)`.
- `useRecurringOverridesInRange(from, to)`.
- `useUpsertRecurringOverrides()` — bulk upsert by `(recurring_rule_id, occurrence_date)`. Invalidates both override and transaction queries (transactions query is implicit since UI shows projected sums).
- `useDeleteRecurringOverride()`.

## Verification
- `npm run build` clean (tsc + Vite).
- Supabase advisors: only pre-existing warnings remain (pre-BUDG-012 `handle_new_user` SECURITY DEFINER + auth.leaked-password-protection). My new function is no longer flagged.

## Outcome
Closes Phase 1 of [[BUDG-012 - Plan]] (ST1 + helper portion of ST2).

Next session: Phase 2 — `<MonthlyGoalCard />` on MonthLens with inline numpad set/edit and projection-driven status.
