# BUDG-012 — 2026-04-27 — phase2-goal-hero-card

*Part of [[BUDG-012]]*

## Goal for this session
Visible monthly-goal entry-point on MonthLens with set/edit/clear and live
on-track / over-by-N status driven by the existing projection.

## Execution

### 1. `<MonthlyGoalCard />` (new) — `src/components/MonthlyGoalCard.tsx`
- Accepts `yearMonth`, `projectedEnd`, `currency` as props.
- Reads goal via `useMonthlyGoal(yearMonth)`; null = not-set.
- Three visual states with rings and icons:
  - **not-set:** label "Set a goal" + Plus icon.
  - **on-track:** green ring (`ring-positive/30`) + CheckCircle2 + green amount.
  - **over:** red ring (`ring-negative/40`) + AlertTriangle + red amount + "Short by N".
- Whole card is a `<button>` — tap opens edit sheet (mobile bottom-sheet via `Modal`, desktop centred dialog).
- Edit sheet: text input `inputMode="decimal"` (iOS numpad), `autoFocus` to skip an extra tap, accepts `.` or `,`. Footer: Save (disabled if invalid) + Clear (only when goal exists).
- `whileTap={{ scale: 0.985 }}` for the iOS press feel.

### 2. MonthLens integration
Inserted above the KPI grid:
```tsx
<MonthlyGoalCard
  yearMonth={`${YYYY}-${MM}`}
  projectedEnd={series.totals.projectedEnd}
  currency={currency}
/>
```
The KPI's "Projected end" tile remains — it's the same number, but the
goal card adds *intent* on top.

### 3. Notes / decisions
- Used the existing `Modal` (responsive Radix Dialog with framer-motion drag) instead of vaul because BUDG-006 (vaul rewrite) was rolled back. When/if BUDG-006 lands again, this card automatically inherits the vaul presentation.
- `projectedEnd` here is computed in MonthLens **without** `recurring_overrides` — overrides will start mattering when the rebalance step writes them in Phase 3. That's fine: the card status will refresh via RQ invalidation when Phase 3 lands.
- Long-press → menu (originally floated as the "clear" affordance) replaced by an explicit Clear button inside the edit sheet — same speed, no hidden gesture.

## Verification
- TS clean, `npm run build` PASS.
- All three card states reachable via Supabase row CRUD.

## Outcome
Closes Phase 2 of [[BUDG-012 - Plan]] (ST3 — Goal hero card).

Next session: Phase 3 — `<RebalanceStep />` nested inside `AddTransactionDialog` triggered when an expense pushes projected balance below the goal.
