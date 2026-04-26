# BUDG-003 — 2026-04-26 — Lens architecture

*Part of [[BUDG-003]]*

## Goal of session
Ship the TIME-LENS feature end-to-end: extract the existing month dashboard
into one of four sibling "lens" components, add Today / Week / Forecast lenses,
wire a sticky chip switcher with URL state.

## What I did

### 1. Lens components under `src/pages/lenses/`
- **`TodayLens.tsx`** — hero figure "Left to spend today" = `Σ planned for today − Σ actually spent today`. Mini KPIs: current balance, drift vs plan, income/spent today. List of "what's on for today" pulling from real txs + un-realised recurring instances for today's date.
- **`WeekLens.tsx`** — 7-day rolling window starting today. Aggregates planned/actual income & expense per day, plots a 48px-tall area chart inline, shows "Left to spend this week" as headline. Range query covers current + next month edge.
- **`MonthLens.tsx`** — verbatim copy of the previous monolithic Dashboard month view (KPIs + forecast/actual area chart + upcoming recurring + next-7-days list). All helpers (`Kpi`, `Legend`, `ChartTooltip`, `UpcomingList`) are inlined to keep it self-contained.
- **`ForecastLens.tsx`** — horizon chips (1/3/6/12 months, default 6). For each future month, sums recurring rule instances → income vs expense, builds a running balance from the current opening. Scenarios card with two number inputs (salary delta CZK/month, spending delta % of recurring). Overlays a `ComposedChart` with a dashed baseline line and a solid scenario area, plus a per-month breakdown table.

### 2. `Dashboard.tsx` rewritten as orchestrator
Reads `?lens=today|week|month|forecast` from the URL via `useSearchParams`, defaults to `today`, sticky chip switcher at top with icons (Sun / Calendar / CalendarDays / TrendingUp). Removing `lens=today` keeps the URL clean for the default landing.

### 3. ADR-001 was already in place
"Period switcher on Dashboard, not separate routes" — keeps bottom nav at 5 slots, reuses React Query cache across lenses, "zooming not navigating" mental model.

## Validation
- `npx tsc -b` clean (after dropping unused `AreaChart` import in ForecastLens).
- `npm run build` clean — 17 PWA precache entries.
- Browser-verified all four lenses at iPhone-13 viewport via Playwright integrated browser:
  - Today: hero + KPIs + 3-item list render.
  - Week: 7-day chart + headline.
  - Month: KPI grid + forecast/actual chart + upcoming + 7-day list (all behaviour preserved).
  - Forecast: 6-month projection chart, scenarios card, per-month breakdown.
- Recharts logs an initial `width(-1) height(-1)` warning during the chip-switch transition; transient and clears once layout settles. Not user-visible.

## Outcome
- Commit `ee173b3` pushed to `main`.
- BUDG-003 → Done.
- User now lands on "Today" by default and can zoom out to Week / Month / Forecast.

## Follow-ups (not in scope here)
- Forecast: persist horizon and scenario values in the URL so they survive reload (currently lost). Trivial follow-up — wire `useSearchParams` for `?horizon=N&salary=X&spend=P`.
- WeekLens: today's "Left to spend today" inside Week is implicit (sum of remaining days); could surface today vs rest-of-week as a sub-headline.
- ForecastLens chart: when scenario == baseline, the dashed baseline overlaps the solid line — fine but visually redundant. Could hide the dashed line when no scenario active.
