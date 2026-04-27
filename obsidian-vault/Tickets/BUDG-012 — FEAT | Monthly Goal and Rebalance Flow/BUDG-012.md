# BUDG-012 — FEAT | Monthly Goal + Rebalance Flow

**Status:** Phase 5 done (alert ribbon + trimmed badges + toast + tests); ticket complete
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
- [x] Hero card with three states: not set / on-track / over-by-N.
- [x] Inline numpad edit on tap (`inputMode="decimal"` + autoFocus).
- [x] Clear action in edit sheet (replaces long-press menu).

### ST4 — Rebalance nested-drawer step
- [x] Detect overage on Save inside `AddTransactionDialog`.
- [x] Step 2 inside the same Modal (cross-fade), with future planned expenses list.
- [x] Even-distribution badges per selected item.
- [x] “Adjust manually” toggle → inline editable per-row mini-fields with running total.
- [x] Auto-exclude items going ≤ 0; redistribute remainder.
- [x] Sticky footer: Apply (disabled until covered) | Save anyway (with confirm) | ← Back.

### ST5 — Atomic apply mutation
- [x] Sequential client-side mutation — superseded by RPC.
- [x] Single Supabase RPC `apply_rebalance(tx, overrides)` — SECURITY INVOKER, applied via MCP.
- [ ] On failure: client-side rollback. *(Not needed for the RPC path — nothing mutated locally before the call. Optimistic UI deferred to Phase 5.)*
- [x] Success path closes the sheet; toast left to Phase 5.

### ST6 — Visibility & polish
- [x] Dashboard alert ribbon when goal exceeded.
- [x] Override row → small "trimmed by N" annotation in Recurring page list.
- [x] Tests: even distribution, clamping, no-future-items fallback (vitest, 7 cases).
- [x] Toast on rebalance apply.

## ADRs (planned)
- [ ] [[BUDG-012 - ADR-001 - Goal as end-of-month balance, not expense cap]]
- [ ] [[BUDG-012 - ADR-002 - Recurring overrides table over template mutation]]

## Implementation Log
- [[BUDG-012 - 2026-04-27 - bugfix-projection-consistency]] — fix Ledger/Month/Forecast projection to match goal trigger; honour overrides in every lens
- [[BUDG-012 - 2026-04-27 - phase5-polish]] — alert ribbon, trimmed badges on Recurring, toast on rebalance apply, vitest setup + 7 distribution tests
- [[BUDG-012 - 2026-04-27 - bugfix-opening-and-oneoff-candidates]] — fix rebalance trigger when no opening anchor + include one-off planned expenses in candidates; RPC v2 with tx_updates
- [[BUDG-012 - 2026-04-27 - phase4-atomic-rpc]] — apply_rebalance RPC + useApplyRebalance hook
- [[BUDG-012 - 2026-04-27 - phase3-rebalance-step]] — step machine + RebalanceStep + distributeEvenly
- [[BUDG-012 - 2026-04-27 - phase2-goal-hero-card]] — MonthlyGoalCard + MonthLens integration
- [[BUDG-012 - 2026-04-27 - phase1-data-and-projection]] — migrations, types, hooks, projection helper

## QA
- _none yet_

## API
- _planned: monthly_goals + recurring_overrides schema doc_

## Prompts
- _n/a_

---

*Source ticket. Linked from [[00 Vault Index]].*
