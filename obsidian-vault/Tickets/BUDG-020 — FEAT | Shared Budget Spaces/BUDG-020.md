# BUDG-020 — FEAT | Shared Budget Spaces

**Status:** Refinement done — ready for Plan detailing
**Branch:** _not yet created_
**Depends on:** existing transactions/categories/recurring engine ([[BUDG-001]]), monthly goal infra ([[BUDG-012]])

## Problem
User wants to track joint spending with a partner (and potentially other people: friends, parents) without merging finances. Each person's money stays personal — there is no shared wallet. But both want a transparent shared view of the transactions they jointly agree are "joint", with planned/spent visibility for both sides.

## Concept (TL;DR)
A **Space** is a shared *view* over personal ledgers, joined by a `space_id` tag on transactions. No shared cash pool, no per-person commitments, no monetary limits. Just a tag + a co-owned categorization scheme + invite mechanics.

## Acceptance criteria (MVP)
- [ ] User can create a Space (name, currency); creator becomes owner.
- [ ] Owner can generate single-use, time-limited invite links (TTL 7d).
- [ ] Anyone with a valid invite link auto-joins the Space on click (after auth).
- [ ] Space has its own categories (`space_categories`), shared between members.
- [ ] Any transaction (one-off or recurring) can be tagged with `space_id` + `space_category_id`.
- [ ] **Personal Ledger** shows shared transactions inline, with a Space badge (e.g. "Кафе · Joint:Аня").
- [ ] **Context switcher** in Layout lets user toggle: `Personal | Joint: <Space Name>`.
- [ ] In Joint context, Dashboard / Ledger / Recurring / time-lenses all filter to that space's shared transactions (mine + partner's, single feed with author indicator).
- [ ] Quick-add (`N`) is context-aware: in Joint context preselects `space_id` + space categories.
- [ ] RLS: members read all shared tx in their spaces; never read each other's personal tx; never write each other's tx.
- [ ] Ledger toggle between **Planned** (`confirmed_at IS NULL`) and **Spent** (`confirmed_at IS NOT NULL`) totals in Joint context.
- [ ] Out of scope MVP: limits, commitments, headroom visibility, notifications, settle-up, multi-currency conversion.

## Subtasks
See [[BUDG-020 - Plan]].

## Index

### Analysis
- [[BUDG-020 - Refinement Discussion]] — full requirements refinement (model v1 → v3)

### Implementation
- [[BUDG-020 - Plan]] — phased plan + checklists

### ADR
- [[BUDG-020 - ADR-001 - Space as tag, not separate ledger]]
- [[BUDG-020 - ADR-002 - Context switcher over separate routes]]
- [[BUDG-020 - ADR-003 - No commitments or limits in MVP]]

### API
- _(none yet)_

### QA
- _(none yet)_

### Prompts
- _(none yet)_

### Implementation Log
- [[BUDG-020 - 2026-04-27 - phase6-polish-and-rls-bugfix]] — Phase 6 polish + RLS create-space bugfix
- [[BUDG-020 - 2026-04-27 - phase5-space-aware-filtering]] — Phase 5 + member emails; all screens honour currentSpaceId
- [[BUDG-020 - 2026-04-27 - phase4-context-switcher]] — Phase 4 context switcher in Layout
- [[BUDG-020 - 2026-04-27 - phase2-hooks-and-phase3-ui]] — Phase 2 hooks + Phase 3 Spaces UI shipped
- [[BUDG-020 - 2026-04-27 - refinement-and-phase1-migration]] — refinement done; Phase 1 schema + RLS applied
