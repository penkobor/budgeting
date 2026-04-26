# BUDG-003 — ADR-001 — Period switcher on Dashboard, not separate routes

*Part of [[BUDG-003]]*

**Status:** Accepted
**Date:** 2026-04-26

## Context

User wants to view their finances through four time lenses: Today, Week,
Month, Forecast. Two structural options exist:

1. Four separate routes (`/today`, `/week`, `/month`, `/forecast`) wired
   into the bottom nav.
2. One Dashboard route with a chip switcher that swaps the lens content
   in place.

Constraints:
- The mobile bottom nav already has 5 slots (Dashboard, Ledger,
  Recurring, Categories, Settings). Adding 3 more pushes us into a
  hamburger-menu territory we explicitly avoided in BUDG-002.
- All four lenses share the same data sources (transactions in range,
  recurring rules, opening balance). Splitting them across four routes
  forces duplicated data-fetch hooks and four `useTransactionsInRange`
  windows fighting over caches.
- The user's mental model is "I'm looking at *my situation*, just at
  different zoom levels" — not "I'm using four different tools".

## Decision

**Single Dashboard route** with a `PeriodSwitcher` chip group at the top.
Active lens lives in `?lens=today|week|month|forecast` so URLs are
shareable, the browser back-button toggles between lenses, and PWA
shortcuts can deep-link to a specific lens.

Today is the default when `?lens` is absent.

## Consequences

**Positive**
- Bottom nav stays at 5 slots — no IA churn.
- One route shares one set of `useQuery` calls; React Query caches each
  range once.
- Switching lenses feels like zooming, not navigating — closer to how
  Apple's Health and Screen Time apps handle period switching.

**Negative**
- Dashboard component becomes larger; each lens is a sub-component but
  the file grows.
- A single route can't have lens-specific page titles in a meta sense
  (only `<title>` swap, fine for SPA).

## Alternatives considered

- **Four routes**: rejected — see Context.
- **Swipeable horizontal pages** (like iOS weather): nice but requires a
  carousel library and gesture conflicts with the modal swipe-to-dismiss
  shipped in BUDG-002.
- **Vertical scroll with all four lenses stacked**: rejected — defeats
  the "headline answer" intent (user has to scroll past Today to find
  Forecast and vice versa).
