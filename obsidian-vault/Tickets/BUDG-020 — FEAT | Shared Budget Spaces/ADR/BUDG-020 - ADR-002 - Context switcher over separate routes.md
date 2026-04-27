# BUDG-020 — ADR-002 — Context switcher over separate routes

*Part of [[BUDG-020]]*

**Status:** Accepted (2026-04-27)
**Date:** 2026-04-27

## Context

Spaces add a new viewing dimension on top of existing screens (Dashboard, Ledger, Recurring, time-lenses). Two integration shapes are possible:

1. **Separate top-level section**: add `Spaces` to the navigation. Each space has its own dedicated `/spaces/:id` page that re-implements ledger / dashboard / charts in a space-scoped way.
2. **Card on Dashboard + dedicated route**: discoverable preview, clicking opens a dedicated space page.
3. **Context switcher**: a dropdown / pill in the layout chrome that toggles a global `currentSpaceId`. All existing screens read this and filter accordingly.
4. **Hybrid**: context switcher + a discovery card on Dashboard listing user's spaces.

App constraints:
- Mobile bottom nav already has 5 slots filled (Dashboard / Ledger / Recurring / Assets / Settings). Adding a 6th degrades the design.
- All existing screens (Dashboard, Ledger, Recurring, time-lenses) already need to filter by space — the logic is identical regardless of route.
- User intends to be in multiple spaces (couple, friends, parents).

## Decision

**Adopt option 3: Context switcher.** Place a context selector in the Layout (sidebar on desktop, compact pill in header on mobile). It exposes `Personal | Joint: <Name1> | Joint: <Name2> | …`. The current selection lives in the `ui` store as `currentSpaceId: string | null`. Existing screens read it and filter their queries.

A small discovery card may live on the Personal Dashboard listing user's spaces, but it is informational only — clicking it switches context, it does not navigate to a different page.

Settings and Assets are always Personal (the switcher hides or disables itself there).

## Consequences

**Positive**
- Zero duplicated screen logic. Ledger, Dashboard, Recurring, time-lenses all reuse their existing implementations with one extra filter.
- Adding a new Space requires no new routes — the switcher just gets one more entry.
- Mobile navigation is preserved as-is.
- Mental model: "I'm currently looking at my Personal budget / our Joint budget", same UX shape, different scope.
- Easy to extend later (e.g., space-specific accent color when context is Joint).

**Negative**
- All queries must be context-aware. Forgetting to thread `currentSpaceId` through a query yields a silent bug (showing personal data in Joint context). Mitigated by centralizing space-aware query hooks.
- Context state is global UI state, not URL-encoded — refresh resets to Personal. Acceptable for MVP; can persist to localStorage trivially.
- Deep-linking to a specific Space requires a query param (`?space=<id>`) hydrating the store — defer.

**Neutral**
- Joint context badge in Layout chrome must be highly visible to prevent confusion ("am I editing personal or shared right now?").

## Alternatives considered

### Option 1 — Separate `/spaces` section + per-space pages
Rejected: requires duplicating ledger/dashboard/recurring/time-lenses UI inside a Space page, or building a shared-component framework. High effort for low payoff. Mobile nav congestion.

### Option 2 — Dashboard card + dedicated route
Rejected for the same duplication reason. The space "page" would still need a ledger, time-lenses etc.

### Option 4 — Hybrid (3 + Dashboard card)
Compatible with this ADR — the Dashboard card is a discovery aid, not a separate UX surface. Treat as a polish item in Plan Phase 5.

## References
- Plan: [[BUDG-020 - Plan]]
- Refinement: [[BUDG-020 - Refinement Discussion]]
