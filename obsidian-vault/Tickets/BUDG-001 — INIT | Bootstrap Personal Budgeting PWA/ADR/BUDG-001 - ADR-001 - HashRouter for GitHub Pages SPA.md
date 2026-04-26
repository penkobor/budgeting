# BUDG-001 — ADR-001 — HashRouter for GitHub Pages SPA

**Ticket:** [[BUDG-001]] — Bootstrap Personal Budgeting PWA
**Date:** 2026-04-26
**Status:** Accepted
**Supersedes:** none

---

## Context

The app is a single-page React app deployed to GitHub Pages under a project subpath (`/budgeting/`). GitHub Pages is a static host with no rewrite rules — it serves files at literal URLs and returns its 404 page for any path that doesn't map to a real file. A `BrowserRouter` route like `/budgeting/ledger` would 404 on direct visit or browser refresh because no `ledger/index.html` file exists.

The standard workaround (copy `index.html` → `404.html`) works for navigation but breaks deep-link sharing on some social/email link previewers and shows a 404-status response (bad for SEO; also the server actually returns 404 even though the body is the SPA shell).

Constraints:
- Must support browser refresh on any route without 404
- Must work under a subpath (`/budgeting/`) and identically on localhost
- Solo personal app — SEO is irrelevant; no need for crawlable URLs

---

## Decision

Use **`HashRouter`** from `react-router-dom`. URLs look like `/budgeting/#/ledger`. The hash fragment is never sent to the server, so GitHub Pages always serves `index.html` regardless of route, and refresh / direct-link always works.

Keep the `dist/index.html → dist/404.html` copy step in the deploy workflow as defensive fallback in case routing is changed later.

---

## Consequences

### Positive
- Zero server config; works on any static host (GH Pages, Netlify, Cloudflare Pages, S3+CloudFront).
- Refresh and deep-link always work.
- Trivial to deploy — no rewrite rules, no `_redirects`, no `404.html` hack required for routing.

### Negative
- URLs include `#`, which looks dated and less clean than path-based routes.
- Some link previewers / analytics tools treat the hash as opaque and don't track deep paths.
- If migrating to a host with rewrite support later, all existing shared links would need redirects.

### Neutral
- Hash routing has no effect on PWA install or service worker behavior.
- React Router API is identical between `BrowserRouter` and `HashRouter` — switching is a one-line change in `App.tsx`.

---

## Alternatives considered

### Option A — `BrowserRouter` + `404.html` copy
- Pros: Clean URLs (`/budgeting/ledger`).
- Cons: GitHub Pages still returns HTTP 404 status (only the body is the SPA shell); breaks some link tools; misleading in DevTools / network logs.
- Rejected because: status-code lie is brittle, and clean URLs aren't worth it for a personal solo app.

### Option B — Migrate to Cloudflare Pages with `_redirects` rewrite
- Pros: Clean URLs with proper 200 status; equally free.
- Cons: Yet another platform account; loses the GitHub Pages "everything in the repo" simplicity; requires Cloudflare DNS or `pages.dev` subdomain.
- Rejected because: GH Pages is already wired to the repo; the user explicitly asked for GitHub Pages.

### Option C — Pre-render every route at build time
- Pros: Real static files for each route.
- Cons: Requires SSG (Astro / Next export) or client-side route discovery; over-engineered for an authed SPA where most routes are dynamic per-user.
- Rejected because: SPA with dynamic data behind auth gains nothing from pre-rendering.

---

*Part of [[BUDG-001]]*
