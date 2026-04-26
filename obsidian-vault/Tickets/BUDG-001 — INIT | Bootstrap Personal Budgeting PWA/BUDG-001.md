# BUDG-001 — INIT | Bootstrap Personal Budgeting PWA

**Repo:** [penkobor/budgeting](https://github.com/penkobor/budgeting)
**Live:** https://penkobor.github.io/budgeting/
**Status:** In Progress
**Started:** 2026-04-26
**Branch:** `main` (no feature branches yet — solo project, direct-to-main)

---

## Summary

Initial bootstrap of a personal budgeting PWA that mirrors the user's Numbers spreadsheet workflow (Fixed-payments table + monthly daily ledger with running balance), backed by Supabase, deployed free to GitHub Pages, installable on iOS/macOS as a PWA. Stack chosen for **zero hosting cost** and **cross-device data sync** via a single hosted Postgres.

Current state: app deployed and live; auth working with email/password; ready for first-use data import (April 2026 sample).

---

## Notes

### Analysis
- _none yet — design happened inline with build_

### Implementation
- [[BUDG-001 - Plan]] — what we plan to do (bootstrap + deploy)

### Implementation Log
- [[BUDG-001 - 2026-04-26 - bootstrap-and-deploy]] — initial scaffold, schema, all pages, GH Pages deploy, auth fix

### QA
- _none yet_

### API
- _none yet — Supabase auto-generated PostgREST consumed via supabase-js_

### Prompts
- [[Feedback]] — first-iPhone-test feedback that spawned [[BUDG-002]]

### ADRs
- [[BUDG-001 - ADR-001 - HashRouter for GitHub Pages SPA]] — chose hash-based routing over BrowserRouter
- [[BUDG-001 - ADR-002 - Email-password auth over magic-link or anonymous]] — final auth strategy after iterating
- [[BUDG-001 - ADR-003 - Hybrid ledger plus categories data model]] — daily-running-balance ledger combined with categorisation
- [[BUDG-001 - ADR-004 - Tailwind + CSS variables over component library]] — theming approach
- [[BUDG-001 - ADR-005 - GitHub Pages + Actions over alternative free hosts]] — hosting choice

---

*Part of [[00 Vault Index]]*
