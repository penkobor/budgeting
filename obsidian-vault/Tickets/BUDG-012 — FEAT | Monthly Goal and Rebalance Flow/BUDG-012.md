# BUDG-012 — FEAT | Monthly Goal + Rebalance Flow

**Status:** Phase 1 done (data + projection helper)
**Branch:** `feature/budg-012-monthly-goal-rebalance`
**Depends on:** existing recurring engine ([[BUDG-001]]), Forecast lens ([[BUDG-003]])

## Problem
User wants to commit to a target end-of-month balance ("я хочу закрыть месяц с N тысяч крон") and have the app actively help maintain it: when an unplanned expense pushes the projected end-of-month balance below the goal, the app should suggest **future planned expenses** (recurring + future-dated one-offs) to trim, distribute the overage evenly across the user's selection, and apply everything atomically.

## Goal definition
Goal = **target end-of-month balance**.
`projected_end_balance = current_balance + Σ(future income) − Σ(future expenses)`
Met when `projected_end_balance ≥ goal_amount`.

Triggered only when adding **expense** transactions. Income/transfers save normally.

## Acceptance criteria
- [ ] User can set/edit/clear a monthly goal from MonthLens hero card (inline numpad).
- [ ] Goal persists per `(user_id, year_month)` in Supabase with RLS.
- [ ] Adding an expense that drops `projected_end_balance` below goal triggers a nested rebalance step inside the Add Transaction sheet.
- [ ] Rebalance step lists future planned expenses for the current month, with checkbox multi-select.
- [ ] Selected items absorb the overage **evenly** by default; user can switch to manual mode and edit individual deltas.
- [ ] If a distribution would push an item ≤ 0, that item is auto-excluded and remainder is redistributed.
- [ ] Apply button is disabled until the distribution sums exactly to the overage.
- [ ] "Save anyway" shows a confirm dialog and saves with goal-exceeded state visible on dashboard.
- [ ] Recurring item adjustments are stored as `recurring_overrides` rows (no template mutation).
- [ ] Dashboard shows goal status (On track / Over by N) on MonthLens.

## Subtasks

### ST1 — Data model
- [x] Migration: `monthly_goals (id, user_id, year_month TEXT 'YYYY-MM', amount NUMERIC, created_at, updated_at)` + unique `(user_id, year_month)` + RLS.
- [x] Migration: `recurring_overrides (id, user_id, recurring_id, occurrence_date DATE, amount_override NUMERIC NULL, skipped BOOL, created_at)` + unique `(recurring_id, occurrence_date)` + RLS.
- [x] Update `db.types.ts`.
- [ ] Update `recurring.ts` projection to honour overrides. *(done via new `projection.ts` helper instead of mutating `recurring.ts`)*

### ST2 — Goal CRUD + projection helper
- [x] `useMonthlyGoal(yearMonth)` hook.
- [x] `computeProjectedEndBalance(month)` helper.
- [x] Mutations: setGoal, clearGoal.

### ST3 — Goal hero card on MonthLens
- [ ] Hero card with three states: not set / on track / over-by-N.
- [ ] Inline-numpad edit on tap.
- [ ] Long-press menu: edit / clear.

### ST4 — Rebalance nested-drawer step
- [ ] Detect overage on Save inside `AddTransactionDialog`.
- [ ] Nested vaul step (slide-in from right) with future planned expenses list.
- [ ] Even-distribution badges per selected item.
- [ ] "Adjust manually" toggle → inline editable per-row mini-fields with running total.
- [ ] Auto-exclude items going ≤ 0; redistribute remainder.
- [ ] Sticky footer: Apply (disabled until covered) | Save anyway (with confirm) | ← Back.

### ST5 — Atomic apply mutation
- [ ] Single Supabase RPC or batched mutation: insert tx + upsert overrides for selected items.
- [ ] On failure: rollback in client (RQ optimistic update with revert).
- [ ] Toast: "Rebalanced — back on track ✓".

### ST6 — Visibility & polish
- [ ] Dashboard alert ribbon when goal exceeded.
- [ ] Override row → small "trimmed by N" annotation in Recurring page list.
- [ ] Tests: even distribution, clamping, manual mode, no-future-items fallback.

## ADRs (planned)
- [ ] [[BUDG-012 - ADR-001 - Goal as end-of-month balance, not expense cap]]
- [ ] [[BUDG-012 - ADR-002 - Recurring overrides table over template mutation]]

## Implementation Log
- [[BUDG-012 - 2026-04-27 - phase1-data-and-projection]] — migrations, types, hooks, projection helper

## QA
- _none yet_

## API
- _planned: monthly_goals + recurring_overrides schema doc_

## Prompts
- _n/a_

---

*Source ticket. Linked from [[00 Vault Index]].*
