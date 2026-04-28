# BUDG-022 - ADR-001 - Shared redistribution lives in owner app, not public page

*Part of [[BUDG-022]]*

## Status

Accepted — 2026-04-28

## Context

BUDG-021 ships a public read-only share page at `#/share/:slug`. The owner now wants to *redistribute* money between shared events. Two surfaces could host the editing UI:

1. The public `/share/:slug` page, gated by `auth.uid() === share_links.user_id` for the current session.
2. The authenticated owner-only budgeting app (a new "Shared" lens or a Settings → Share editor).

## Decision

Editing affordances live **only in the authenticated owner app**, on a new **Shared Lens** alongside the existing Today / Week / Month / Forecast lenses. The `/share/:slug` page remains strictly read-only and anonymous.

## Consequences

- **Pro** — clean security model: `/share/:slug` keeps a single SECURITY DEFINER read RPC and zero write paths, so RLS surface is unchanged.
- **Pro** — owner already has the app open daily; no need to re-authenticate against a shareable URL.
- **Pro** — the redistribute flow can reuse private categories/notes that we deliberately do **not** expose in `get_public_share`.
- **Con** — the owner can't edit "live in the share preview"; if they want to verify how a redistribute looks publicly, they must reload `/share/:slug`. Acceptable: BUDG-021 explicitly markets the page as a snapshot.
- **Con** — non-owner authenticated users who happen to know the slug can't ever edit. By design.

## Alternatives considered

- **Public page with owner-conditional buttons** — rejected because it forces `get_public_share` to leak owner identity (or to add a second authenticated RPC), and tempts feature creep into the anon surface.
- **Inline edit on TodayLens / Ledger** — rejected because it conflates "private planning" rows with "shared planning" rows. Users want to see the shared bag *as a bag* to redistribute within it.
