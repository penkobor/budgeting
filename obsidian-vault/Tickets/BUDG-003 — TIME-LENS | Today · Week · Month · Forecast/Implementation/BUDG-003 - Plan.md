# BUDG-003 — Plan

*Part of [[BUDG-003]]*

## Goal

Re-anchor the home screen on **what can I spend right now**. Replace the
month-only dashboard with a four-step lens: **Today → Week → Month → Forecast**.

## Subtasks

### ST1 — Period chip switcher on Dashboard
- New `PeriodSwitcher` component at top of Dashboard with 4 chips:
  Today / Week / Month / Forecast.
- Lens state held in URL query (`?lens=today|week|month|forecast`,
  default `today`) so links + back-button work.
- Default lens on first visit = `today`.

### ST2 — Today lens
- Big headline: **"Left to spend today"** = `plannedToday − actualToday`
  (clamped to ≥ 0).
- Secondary metrics: planned today, spent today, recurring due today,
  current balance.
- "What's planned" list — today's rows from the ledger (transactions +
  un-realized recurring instances for today).

### ST3 — Week lens
- Headline: **"Left to spend this week"** = sum of `(planned − actual)`
  for today through the next 6 days, clamped ≥ 0 per day then summed.
- Mini bar chart: planned vs actual per day, last 3 + today + next 3.
- "What's planned" list for the 7-day window.

### ST4 — Month lens
- Equivalent to today's Dashboard view: KPI grid + Forecast vs Actual area
  chart + Upcoming this month + Next 7 days. No new logic — just the
  current Dashboard moved behind the chip.

### ST5 — Forecast lens
- Configurable horizon slider (1, 3, 6, 12 months — chips, default 6).
- Multi-month area chart: cumulative running balance projected from
  current opening + recurring rules.
- "Scenarios" card with two number inputs (delta values, persisted in
  URL `?salary=+10000&spend=-15`):
  - **Salary delta** (CZK/month, default 0)
  - **Spending delta** (% of recurring expense, default 0)
- Chart re-renders with both lines: baseline (dashed) + scenario (solid).
- Headline: balance at horizon end (baseline + scenario).

### ST6 — Routing + nav copy
- Bottom nav "Dashboard" entry stays at `/`. Sidebar "Dashboard" → "Home".
- No new routes.

### ST7 — Verification
- Browser audit at iPhone width.
- `npx tsc -b` + `npm run build` clean.
- Commit + push + log + close ticket.

## Out of scope
- Saving named scenarios server-side (URL params are enough for v1).
- Per-category lenses (e.g. "left in groceries this week") — possible
  BUDG-004.
- Push notifications when over-budget.
