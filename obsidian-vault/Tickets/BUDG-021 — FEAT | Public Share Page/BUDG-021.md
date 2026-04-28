# BUDG-021 — FEAT | Public Share Page

**Repo:** [penkobor/budgeting](https://github.com/penkobor/budgeting)
**Status:** In Progress
**Started:** 2026-04-28
**Branch:** _current working branch_
**Supersedes:** [[BUDG-020]] (see [[BUDG-020 - ADR-004 - Supersede Spaces with read-only public share page]])

---

## Summary

Replace BUDG-020's multi-tenant Spaces with a much simpler concept: a personal user can mark individual transactions and recurring rules as `is_shared`, and publish a single read-only page at `/share/:slug` that anyone with the link can view. No member management, no invites, no shared counters, no import-back. The page renders shared entries grouped by month, in a "<display_name> plans: …" narrative format.

---

## Notes

### Analysis
- _none — pivot rationale fully captured in [[BUDG-020 - ADR-004 - Supersede Spaces with read-only public share page]]._

### Implementation
- [[BUDG-021 - Plan]] — phased plan + checklists

### ADRs
- _(none yet — design questions resolved by BUDG-020/ADR-004 + Plan)_

### API
- _(none yet)_

### QA
- _(none yet)_

### Prompts
- _(none yet)_

### Implementation Log
- [[BUDG-021 - 2026-04-28 - pivot-and-rebuild]] — strip BUDG-020, schema flip, public share page

---

*Self-link: [[BUDG-021]]*
