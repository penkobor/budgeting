# BUDG-020 — ADR-004 — Supersede Spaces with read-only public share page

*Part of [[BUDG-020]]*

**Status:** Accepted (2026-04-28) — supersedes [[BUDG-020 - ADR-001 - Space as tag, not separate ledger]], [[BUDG-020 - ADR-002 - Context switcher over separate routes]], [[BUDG-020 - ADR-003 - No commitments or limits in MVP]]
**Date:** 2026-04-28

## Context

BUDG-020 shipped a full multi-tenant "Space-as-tag" feature: 4 tables (`spaces`, `space_members`, `space_categories`, `space_invites`), 3 SECURITY DEFINER RPCs, ~6 RLS policies, ContextSwitcher in Layout, SpaceDetail page, InviteAccept route, and `currentSpaceId` filtering threaded through Dashboard / Ledger / Recurring / time-lenses / AddTransactionDialog.

After dogfooding the design, the user reframed the actual goal:

> Я не хочу общих счётчиков. Я хочу чтобы я как пользователь с личным спейсом мог создать read-only страничку, которой я могу делиться с кем угодно, и там будут в реал-тайм мои "shared" записи в формате
> «Борис планирует: 1 мая — потратить 3000 на …; 4 мая — 200; всего в мае 20 000…».
> Никаких возможностей добавлять из shared в свой личный — shared от слова "поделиться".

The actual requirement is **publish, not collaborate**. The whole multi-tenant edifice (members, RLS-based read-through, per-space categories, invites, role separation) does not serve this goal — it just adds load-bearing complexity.

## Decision

**Retire all of BUDG-020 in favour of a simpler "public share" feature** tracked under a new ticket, [[BUDG-021]] — *FEAT | Public Share Page*.

Concrete changes:

1. Frontend: delete `src/hooks/spaces.ts`, `src/components/ContextSwitcher.tsx`, `src/pages/SpaceDetail.tsx`, `src/pages/InviteAccept.tsx`. Drop `currentSpaceId` from the UI store and routes from `App.tsx`. Strip space-aware branches from every consumer screen.
2. Database: a new "down" migration drops the four space tables, the three RPCs, the `space_id` / `space_category_id` columns, and all related RLS policies. Replaces them with a `transactions.is_shared boolean` (and same on `recurring_rules`).
3. New schema: `share_links (user_id PK, slug UNIQUE, display_name, created_at)` + `get_public_share(p_slug)` SECURITY DEFINER RPC for unauthenticated reads.
4. Routes: `/spaces/:id` and `/invite/:token` are removed; new public route `/share/:slug` lives **outside** the auth gate.

This ADR explicitly **supersedes ADR-001, ADR-002, ADR-003**. Their Decisions remain readable for historical context (per R6b ADRs are immutable) but their guidance no longer applies.

## Consequences

**Positive**
- Massive surface-area reduction: ~5 frontend files removed, ~3 migration tables dropped, RLS becomes trivial again (no cross-user reads anywhere).
- The mental model collapses to one axis ("is this entry public?") instead of two ("which space + which category").
- `/share/:slug` is fully cacheable / Open-Graph-friendly / forwardable; no auth flow blocks recipients.
- All future tickets that touch transactions stop having to reason about `space_id` filtering.

**Negative**
- Throws away ~1 day of BUDG-020 implementation work. Acceptable: the underlying need was misidentified.
- Lose multi-recipient differentiation (one share-page per user; cannot have separate views for "for partner" vs "for parents"). Explicitly accepted — see [[BUDG-021 - Plan]].
- Lose "joint category taxonomy" — shared entries reuse the author's personal categories. Acceptable for a publish-only flow.

**Neutral**
- Existing rows have `space_id IS NULL`, so the `space_id → is_shared` rewrite is data-loss-free. (No production users yet, so down-migration is safe regardless.)

## Alternatives considered

### Keep BUDG-020 as-is and graft a "public viewer" on top
Rejected: keeps both the heavy multi-tenant model AND adds the new public surface. The user explicitly asked for the simpler model; carrying both would be double the maintenance for no gain.

### Repurpose `space_id` as the public-share key (one space == one share page)
Considered. Rejected because Spaces still imply membership, invite tokens, and RLS-based cross-user reads — none of which the new feature needs. Easier to delete cleanly than to bend the existing model.

### Soft-deprecate (leave tables, hide UI)
Rejected: stale schema is technical debt. The migration cost is small; clean cut is preferred.

## References
- Pivot conversation: 2026-04-28 (`/memories/session/budg-021-pivot.md`).
- Successor ticket: [[BUDG-021]].
- Implementation log: [[BUDG-021 - 2026-04-28 - pivot-and-rebuild]].
