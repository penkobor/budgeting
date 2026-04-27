# BUDG-012 — Plan

*Part of [[BUDG-012]]*

## Strategy
Build the data model first (goals + recurring overrides) so that projection and UI can both be developed against real persisted state. Then ship the goal CRUD + hero card, then the rebalance nested-drawer flow, then polish (alerts, override annotations).

## Phases

### Phase 1 — Data + projection
- Two new tables in Supabase with RLS.
- Update `recurring.ts` to apply overrides during forecast generation.
- `computeProjectedEndBalance(month)` helper that the rest of the feature depends on.
- _exit:_ existing Forecast/Month lenses still render correctly; goal fetch works.

### Phase 2 — Goal hero card
- New `<MonthlyGoalCard />` in `MonthLens`.
- Inline numpad for set/edit; long-press for clear.
- States: not-set, on-track (green), over-by-N (red).
- _exit:_ user can set + see + edit goal; status reflects projection.

### Phase 3 — Rebalance nested step
- Refactor `AddTransactionDialog` Save handler to check overage for expenses.
- Build `<RebalanceStep />` component used as a nested vaul drawer step.
- Even-distribution algorithm with auto-exclusion + redistribution loop.
- Manual-edit mode with running-total validator.
- Confirm-dialog-wrapped "Save anyway".
- _exit:_ over-budget expense triggers step 2; apply produces correct overrides.

### Phase 4 — Atomic apply
- Supabase RPC `apply_rebalance(tx_payload, overrides[])` (PL/pgSQL) for atomic insert + upserts.
- RQ optimistic update with rollback on failure.
- _exit:_ no partial-state failures; toast on success.

### Phase 5 — Polish
- Dashboard "Goal exceeded" alert ribbon.
- Recurring list shows "trimmed by N for this occurrence" badge.
- Tests for distribution math, clamping, fallbacks.
- _exit:_ acceptance criteria all green.

## Risks / open questions
- **Performance of projection:** computing `projected_end_balance` on every keystroke in Add Transaction may be expensive. Mitigation: memoise per (month, transactions hash, overrides hash); recompute only on Save.
- **Currency edge cases:** uneven division (601 / 3 = 200.33...). Round to 2 decimals, dump remainder cents on the last item.
- **Past-month edits:** if user edits a past transaction, do we re-trigger rebalance? Out of scope — rebalance is a forward-looking flow on Add only.
- **Goal carry-over:** rolling unused balance to next month → out of scope v1.
- **Multi-currency accounts:** goal in single currency = primary account currency. Out of scope to handle FX.

## Success metrics (subjective for personal app)
- Adding an over-budget expense feels like "the app is helping me decide", not punishing.
- Set-goal interaction takes ≤ 5 seconds.
- Apply rebalance takes ≤ 1 tap once distribution looks right.
