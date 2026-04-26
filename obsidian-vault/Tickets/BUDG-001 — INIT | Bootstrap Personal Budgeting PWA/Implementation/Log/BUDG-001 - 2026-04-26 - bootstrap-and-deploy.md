# BUDG-001 — Bootstrap, deploy, and final auth fix

**Ticket:** [[BUDG-001]] — Bootstrap Personal Budgeting PWA
**Date:** 2026-04-26
**Type:** Implementation Log (entry)

---

## Context

Single long working session covering the entire initial build: from "let's plan a budgeting app" → live deployed PWA at https://penkobor.github.io/budgeting/ with a working email+password account ready for first-time data import.

Documented after the fact (vault did not exist during the session — created at the end as part of the same session).

---

## Changes

### Database (Supabase project `xowbsqjkipknpxarynzu`)
- Migration `init_budgeting_schema` applied: 5 tables (`categories`, `recurring_rules`, `transactions`, `monthly_openings`, `settings`) with RLS `user_id = auth.uid()` on every table.
- `handle_new_user` trigger seeds a `settings` row on signup so the app never has to create-on-read.

### Frontend (Vite + React + TS)
- Scaffolded with `npm create vite@latest` (React + TS template).
- Added `@/*` path alias via `tsconfig.app.json` `paths` (NOT `baseUrl` — deprecated in TS 6 with `noEmit`).
- Tailwind 3 with `darkMode: 'class'` + CSS-variable theme tokens in [src/index.css](../../../../src/index.css).
- TanStack Query 5 for server state ([src/hooks/queries.ts](../../../../src/hooks/queries.ts)), Zustand 5 with persist for UI state ([src/store/ui.ts](../../../../src/store/ui.ts)).
- HashRouter (see [[BUDG-001 - ADR-001 - HashRouter for GitHub Pages SPA]]).
- Pages: [Auth](../../../../src/pages/AuthPage.tsx), [Dashboard](../../../../src/pages/Dashboard.tsx), [Ledger](../../../../src/pages/Ledger.tsx), [Recurring](../../../../src/pages/Recurring.tsx), [Categories](../../../../src/pages/Categories.tsx), [Settings](../../../../src/pages/Settings.tsx).
- Layout with sidebar + bottom nav + FAB ([src/components/Layout.tsx](../../../../src/components/Layout.tsx)); ⌘K command palette ([src/components/CommandPalette.tsx](../../../../src/components/CommandPalette.tsx)); N hotkey for quick-add ([src/components/AddTransactionDialog.tsx](../../../../src/components/AddTransactionDialog.tsx)).
- April 2026 seed-from-Numbers helper ([src/lib/seed.ts](../../../../src/lib/seed.ts)) wired to Settings → Import button.

### PWA + Deploy
- `vite-plugin-pwa` 1.2 + `@vite-pwa/assets-generator` (preset `minimal-2023`) generates 192/512/maskable + apple-touch icons.
- Workflow [`.github/workflows/deploy.yml`](../../../../.github/workflows/deploy.yml) — builds with secrets, copies `index.html → 404.html` for SPA fallback, deploys via `actions/deploy-pages@v4`.

### Auth iteration (the longest debugging arc)
- Started: magic link only → hit Supabase free-tier email rate limit (~3–4/hour) within 4 sign-up attempts.
- Iteration 1: added password mode toggle to [`AuthPage.tsx`](../../../../src/pages/AuthPage.tsx); confirmation emails still rate-limited.
- Iteration 2: tried anonymous sign-in fallback in [src/hooks/useAuth.ts](../../../../src/hooks/useAuth.ts) (`signInAnonymously()` if no session) → instant access but device-bound; user wants cross-device sync, reverted same session.
- Iteration 3: provisioned the user via Supabase admin API (`PUT /auth/v1/admin/users/{id}` with `email_confirm: true` and explicit password) using the service-role key stored in macOS Keychain (`security add-generic-password -s supabase-service-role-budgeting`). User existed already from earlier magic-link signup but had no password set.
- Final state: `penkoboris95@gmail.com` with confirmed email + working password; `useAuth.ts` reverted to clean session-only logic; AuthPage shown when no session.
- See [[BUDG-001 - ADR-002 - Email-password auth over magic-link or anonymous]] for the rationale.

### Deploy bug + fix
- First push to `main` ran the build workflow BEFORE `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` secrets were set. Workflow succeeded but inlined `undefined` for both env vars → blank black screen on https://penkobor.github.io/budgeting/.
- Diagnosed by curling `assets/index-<hash>.js` and grepping for the supabase URL literal (absent) vs the variable name (present, only in the `console.error` warning string).
- Confirmed in workflow logs: `VITE_SUPABASE_URL: ` (empty) in the Build step env block.
- Fix: re-set both secrets via `gh secret set ... --body "..."` + re-trigger workflow. Logs now show `VITE_SUPABASE_URL: ***` (masked) and the new bundle contains the literal Supabase URL + publishable key. Site renders.

### Vault (this very file)
- Created `obsidian-vault/` at workspace root following the global vault structure from `~/hwp/obsidian-vault`, adapted with `BUDG-NNN` ticket IDs (no Jira backing for personal projects).
- Three root meta files ([Index](../../../../obsidian-vault/00%20Vault%20Index.md), [Guide](../../../../obsidian-vault/00%20Vault%20Guide.md), [Workflow](../../../../obsidian-vault/00%20Agent%20Workflow.md)).
- BUDG-001 ticket with full subfolder skeleton, Plan, 5 ADRs, this Log entry.

---

## Verification

- `npx tsc -b` — no errors after each iteration
- `npm run build` — succeeds; `dist/` is ~1.1 MB; manifest + sw.js + workbox + icons all generated
- `npm run dev` — local server at `http://localhost:5173/` renders auth → after sign-in renders Dashboard
- GitHub Actions run `24957336879` — succeeded after secrets fix; both env vars masked in logs
- `curl -s https://penkobor.github.io/budgeting/assets/index-DFuU9sap.js | grep -oE '"https://xowbsqjkipknpxarynzu\.supabase\.co"'` → match (env vars now inlined)
- Live site returns HTTP 200 and renders the Auth page (verified by user)
- Admin API `GET /auth/v1/admin/users` confirms `penkoboris95@gmail.com` exists with `email_confirmed_at` set and `is_anonymous: false`

---

## Follow-ups

### Blocking next session
- [ ] User logs in on production with email + password and confirms session persists across reload + PWA install.
- [ ] User runs Settings → "Import April 2026 sample data" and validates Dashboard chart + Ledger render real data.

### User-side dashboard config (cannot be automated — no Supabase Management MCP)
- [ ] Set Site URL = `https://penkobor.github.io/budgeting/` and add Redirect URLs `https://penkobor.github.io/budgeting/**` + `http://localhost:5173/**` at https://supabase.com/dashboard/project/xowbsqjkipknpxarynzu/auth/url-configuration
- [ ] Set "Inactivity timeout" to 7776000 (90 days) at https://supabase.com/dashboard/project/xowbsqjkipknpxarynzu/auth/sessions

### Polish (not urgent)
- [ ] Code-split to silence the 500 KB chunk warning (lazy-load Recharts, framer-motion)
- [ ] Add a category-breakdown donut chart on the Dashboard
- [ ] Inline keyboard navigation in the Ledger (arrow keys between cells)
- [ ] Replace the `₿` glyph icon with a proper SVG (current PWA icon is a Bitcoin symbol — wrong vibe)
- [ ] Consider adding "Link Apple ID / Google" later if email+password becomes annoying

### Cleanup
- [ ] Delete the service-role key from Keychain when no longer needed: `security delete-generic-password -s supabase-service-role-budgeting`

---

*Part of [[BUDG-001]]*
