# BUDG-001 — ADR-005 — GitHub Pages + Actions over alternative free hosts

**Ticket:** [[BUDG-001]] — Bootstrap Personal Budgeting PWA
**Date:** 2026-04-26
**Status:** Accepted
**Supersedes:** none

---

## Context

The user explicitly requested a stack that is **free to deploy on GitHub Pages**. The app is a static SPA + a hosted Supabase backend. The hosting requirement is purely for the static frontend (HTML / JS / CSS / icons / service worker).

Static-host free-tier options considered:

1. **GitHub Pages** with GitHub Actions deploy
2. **Cloudflare Pages**
3. **Netlify**
4. **Vercel**

All four are free for personal use at this scale. The relevant differentiators:

- Already-existing GitHub account and repo; zero new platform onboarding
- Build environment (we need Node 20 + npm + secrets injection at build time for Supabase URL / key)
- Custom-domain support (deferred — `penkobor.github.io/budgeting/` is fine for now)
- Edge function support (NOT needed — all dynamic logic is client-side hitting Supabase)

---

## Decision

Use **GitHub Pages** as the host, with **GitHub Actions** as the build pipeline. Workflow lives at `.github/workflows/deploy.yml`, triggered on push to `main` and manually via `workflow_dispatch`. Build step injects `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_BASE` from repo secrets.

Pages source is configured to **"GitHub Actions"** (not "branch"), so the workflow uploads the `dist/` folder as a Pages artifact and the `actions/deploy-pages@v4` step publishes it.

---

## Consequences

### Positive
- Zero new accounts; one platform owns the repo, secrets, build, and host.
- Deploy is one `git push` to `main` — no separate CLI or web UI step.
- Free TLS via `*.github.io` domain.
- Build secrets are isolated per repo via Actions secrets (correct security boundary for a publishable Supabase anon key).

### Negative
- Subpath deploy (`/budgeting/`) requires `base: '/budgeting/'` in `vite.config.ts` and forces `HashRouter` (see [[BUDG-001 - ADR-001 - HashRouter for GitHub Pages SPA]]).
- No edge functions (irrelevant for this app).
- No automatic preview deploys per PR (irrelevant for a solo project).
- Custom-domain setup (if ever wanted) requires DNS + a CNAME file commit — minor friction.

### Neutral
- Migration to Cloudflare Pages or Netlify later is a config change, not a code change. The Vite build output is portable.
- Service worker / PWA install works identically on GH Pages and any other static host.

---

## Alternatives considered

### Option A — Cloudflare Pages
- Pros: Path-based rewrites (no `HashRouter` needed); generous free tier; integrated CDN.
- Cons: New platform account; another secrets store; DNS through Cloudflare or `pages.dev` subdomain.
- Rejected because: user explicitly asked for GitHub Pages; the only real win (no `HashRouter`) is cosmetic for a solo personal app.

### Option B — Netlify
- Pros: Excellent DX; preview deploys per PR; built-in form handling.
- Cons: New platform account; preview deploys irrelevant for a solo project; form handling not used.
- Rejected because: no advantage over GH Pages for this use case.

### Option C — Vercel
- Pros: Best-in-class for Next.js; great preview deploys.
- Cons: We're on Vite, not Next; nothing Vercel offers that we need.
- Rejected because: tool–stack mismatch (Vercel shines with Next.js SSR/ISR, neither of which we use).

### Option D — Self-host on a $5 VPS
- Pros: Full control; can add server-side things later.
- Cons: Costs money; requires SSL, backups, monitoring; defeats "free" requirement.
- Rejected because: violates free-hosting constraint.

---

*Part of [[BUDG-001]]*
