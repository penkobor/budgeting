# BUDG-001 — Plan

**Ticket:** [[BUDG-001]] — Bootstrap Personal Budgeting PWA
**Type:** Implementation Plan

---

## Goal

Build a single-user budgeting PWA that mirrors the user's Numbers spreadsheet (fixed-payments table + monthly daily ledger with running balance), backed by Supabase free tier, deployed to GitHub Pages, installable on iOS as a PWA. Zero hosting cost; cross-device data sync via Supabase auth + Postgres + RLS.

---

## Tasks

### Database (Supabase)
- [x] Schema: `categories`, `recurring_rules`, `transactions` (signed amounts), `monthly_openings`, `settings`
- [x] RLS policies (`auth.uid() = user_id`) on all five tables
- [x] `handle_new_user` trigger to seed `settings` row on signup
- [x] Hand-written `db.types.ts` matching schema (no codegen step)

### Frontend (React + TypeScript + Vite)
- [x] Vite + React 19 + TS scaffold (`@/*` alias via `tsconfig.app.json` `paths` only — no `baseUrl`)
- [x] Tailwind 3 with `darkMode:'class'` + CSS-variable theming (RGB tuples in `:root` and `.dark`)
- [x] TanStack Query for server state, Zustand (with persist) for UI state
- [x] HashRouter (see [[BUDG-001 - ADR-001 - HashRouter for GitHub Pages SPA]])
- [x] Layout: sidebar (desktop) + bottom nav + FAB (mobile), ⌘K command palette, N quick-add
- [x] Pages: Auth, Dashboard, Ledger, Recurring, Categories, Settings
- [x] Recharts forecast/actual area chart with reference line at opening balance
- [x] `expandRuleInRange` helper for monthly/weekly/yearly/custom recurrence
- [x] April 2026 seed-from-Numbers helper (Settings → Import sample data)

### Auth (Supabase)
- [x] Email + password (AuthPage with magic-link fallback toggle)
- [x] `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: true`
- [x] Real account `penkoboris95@gmail.com` provisioned via admin API (rate-limited on signup confirmation)

### PWA
- [x] `vite-plugin-pwa` with manifest (name, short_name=Budget, theme_color, icons)
- [x] `@vite-pwa/assets-generator` `minimal-2023` preset (192/512/maskable/apple-touch)
- [x] iOS meta tags (`apple-mobile-web-app-capable`, `apple-mobile-web-app-title=Budget`)
- [x] Service-worker precache via Workbox

### Deploy (GitHub Pages)
- [x] `gh-pages` branch via Actions workflow (`build_type=workflow` Pages source)
- [x] `VITE_BASE: /budgeting/` injected at build time
- [x] `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as repo secrets, inlined into bundle (publishable key — safe by Supabase design)
- [x] `dist/index.html → dist/404.html` SPA fallback (defensive, HashRouter doesn't strictly need it)

### Out of scope (deferred)
- Sub-categories / nested categories
- Multi-currency conversion
- Receipt photo OCR
- Family / shared accounts (RLS would need rework)
- Export to CSV / Numbers
- Native iOS app (PWA suffices for now)

---

## Tests

- [x] Local build (`npm run build`) succeeds without errors or warnings beyond chunk-size hint
- [x] Local dev server (`npm run dev`) renders auth + dashboard
- [x] Production deploy returns HTTP 200 on https://penkobor.github.io/budgeting/
- [x] Production JS bundle contains `https://xowbsqjkipknpxarynzu.supabase.co` (env vars inlined)
- [ ] First real-user login → import sample → all pages render real data
- [ ] Add custom transaction, mark recurring as confirmed, edit category — all CRUD round-trips
- [ ] Cross-device test: log in on iPhone PWA + macOS, confirm same data visible in real-time

---

## Non-goals

- Multi-user collaboration
- Bank account sync / Plaid integration
- Native mobile app
- Custom backend (Supabase covers all needs)
- Server-side rendering (pure SPA via GH Pages)

---

*Part of [[BUDG-001]]*
