# Budget — plan, track, profit

A personal budgeting app inspired by a Numbers spreadsheet workflow. Plan your month upfront, then watch a real-time **forecast vs actual** running balance to know if you're on track.

Built with **React 19 + TypeScript + Vite + Tailwind + TanStack Query + Zustand + Recharts + Framer Motion**, backed by **Supabase** (auth + Postgres with RLS). Free to host on GitHub Pages.

## Features

- **Dashboard** — KPI cards (current balance, on-track / behind, projected end-of-month, profit), forecast vs actual area chart, pending recurring entries, next 7 days
- **Ledger** — month view that mirrors a spreadsheet: day · running balance · entries · income · spending. Inline edit, confirm planned → actual, generate recurring instances
- **Recurring rules** — monthly / weekly / yearly / custom-N-days; pause / resume
- **Categories** — colored, typed (income / expense)
- **Settings** — currency, theme, per-month opening balance, seed sample data
- **Command palette** (⌘K) and **quick-add** (N) for keyboard-first flow
- **Mobile-friendly** with bottom nav + FAB; dark mode by default

## Stack

- Vite + React 19 + TS, Tailwind 3 with CSS-variable theming
- TanStack Query (server state) · Zustand (client state)
- Recharts · Framer Motion · cmdk · Radix primitives · lucide-react
- Supabase JS v2 (email magic-link or password auth)
- HashRouter for GitHub Pages SPA compatibility

## Getting started

```bash
cp .env.example .env.local      # already populated locally
npm install --legacy-peer-deps
npm run dev
```

Sign in via magic link or password, then visit **Settings → Seed sample data** to import the April 2026 ledger from your Numbers sheet.

## Deploying to GitHub Pages

1. Push to a GitHub repository.
2. **Settings → Pages → Source = GitHub Actions**.
3. **Settings → Secrets and variables → Actions**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Push to `main` — `.github/workflows/deploy.yml` does the rest.

The Vite `base` path is set to `/<repo-name>/` by the workflow. A `404.html` fallback is generated so HashRouter behaves on Pages.

## Database

Schema lives in the Supabase migration `init_budgeting_schema`. Tables:

- `categories` — id, name, color, kind, sort_order
- `recurring_rules` — frequency, day_of_month / day_of_week / month_of_year / interval_days, amount …
- `transactions` — occurred_on, amount (signed), description, planned, confirmed_at, recurring_rule_id
- `monthly_openings` — month, opening_balance (anchors the running balance)
- `settings` — currency, locale, theme

All tables have **Row Level Security** with `user_id = auth.uid()`. A trigger creates a `settings` row on signup.

## Keyboard shortcuts

- `⌘K` / `Ctrl+K` — command palette
- `N` — quick-add transaction
- `⌘⏎` inside the add dialog — save

## What this gives you over Numbers

- **Forecast vs actual** on one chart — drift visible at a glance
- **Confirm-on-spend** — entries start planned, tick them off when they actually happen
- **Recurring rules** auto-fill the month
- **Multi-month** — opening balance carries over via `monthly_openings`
- **Search & jump** via the command palette
