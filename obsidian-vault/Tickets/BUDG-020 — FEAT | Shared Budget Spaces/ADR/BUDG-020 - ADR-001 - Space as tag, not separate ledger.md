# BUDG-020 — ADR-001 — Space as tag, not separate ledger

*Part of [[BUDG-020]]*

**Status:** Accepted (2026-04-27) — **Superseded by [[BUDG-020 - ADR-004 - Supersede Spaces with read-only public share page]]** (2026-04-28)
**Date:** 2026-04-27

## Context

A "shared budget" feature must let two people track joint spending. Multiple architectural shapes are possible:

1. **Shared wallet / pooled account**: a separate ledger owned by the space; both members deposit into it; transactions debit the pool.
2. **Per-member ledgers, replicated to space**: each tx lives in personal ledger AND a copy in space ledger.
3. **Tag-based view**: each tx lives only in its author's personal ledger; `space_id` tag exposes it in a shared view through RLS.

Constraints from user requirements:
- No money is actually pooled. Each person's money stays separate.
- Cannot spend the other's money — hard invariant.
- Both must see joint transactions of both, with full details.
- Personal transactions remain private.
- Multi-space (couple / friends / parents) must scale.

## Decision

**Adopt option 3: Space-as-tag.** A `Space` entity exists with members, categories, and invite tokens, but no ledger. Transactions have an optional `space_id` (and `space_category_id`) which makes them visible to all members of that space via RLS. Personal balance arithmetic is unchanged — every transaction always debits its author.

## Consequences

**Positive**
- The invariant "you cannot affect another user's balance" is enforced trivially: there is no path that mutates another user's transactions, because transactions still belong to a single `user_id`.
- Multi-space is free: a transaction can in principle have one `space_id`; multiple spaces just means multiple possible tag values.
- Existing screens (Dashboard, Ledger, Recurring, time-lenses) can be reused by adding a `currentSpaceId` filter — no parallel UI for "space ledger".
- Schema diff is additive (two nullable columns + four new tables). No backfill.
- Reversible: a space can be deleted by nulling the tag; transactions revert to personal.

**Negative**
- A transaction can only belong to a single space — if a single dinner is "joint with partner" AND "joint with friends", we cannot split it. (Acceptable for MVP — split-payment is explicitly out of scope.)
- Aggregations require RLS-aware queries that join across users; query plans must be tested.
- "Convert to shared" UX requires changing the category from a personal category to a space category — non-trivial selector UX.

**Neutral**
- Realtime / notifications later need to subscribe per-space, not per-user — but Supabase realtime supports this.

## Alternatives considered

### Option 1 — Shared wallet / pooled account
Rejected: violates user requirement ("деньги остаются у каждого свои"). Would also require deposit-from-personal mechanics, which model the wrong real-world flow (the couple does not actually pool cash).

### Option 2 — Replicated transactions
Rejected: doubles the source of truth (which copy wins on edit?), and creates synchronization complexity. Adds nothing the tag approach does not provide.

### Option 3a — Tag with space_id BUT keep `category_id` for shared tx (no `space_category_id`)
Considered: simpler schema. Rejected because it forces both users to have identically-named personal categories (or pollutes one user's category list with the other's choices). Space-scoped categories are the cleaner mental model and survive members joining/leaving.

## References
- Requirements: [[BUDG-020 - Refinement Discussion]]
- Plan: [[BUDG-020 - Plan]]
