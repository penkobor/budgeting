# BUDG-020 — Refinement Discussion

*Part of [[BUDG-020]]*

Captured from a chat refinement session. Walks the model from v1 (rich, with commitments) → v2 (planned/confirmed-based) → v3 (minimalist, no limits at all). The MVP scope adopts v3.

---

## Problem statement (user, paraphrased)

> I want to be able to carve out a separate budget from my personal one — a joint budget for time spent with my partner. The other person should have access. I want to be able to (a) tag some of my normal expenses (outings, walks, etc.) as part of this joint budget — they should still come out of my personal balance, but also count against the joint tracker. And the other person should be able to add their spend too, which goes against their own balance. There must be hard separation between our money — I cannot spend their money. But I want to see how much they're willing to spend, and if they spend in linked categories it should also tick the joint counter.

## Key insight

> **Space is not a wallet — it's a shared view over personal ledgers, joined by a tag.**

Every transaction always belongs to exactly one user (the payer). `space_id` is a *visibility tag*, not an ownership transfer. This guarantees the "no one can touch the other's money" invariant for free.

---

## Model evolution

### v1 — Commitments + envelope
First draft: each member commits a `monthly_commitment` to the space; the sum of commitments forms the space limit; unused commitment "returns" to personal free budget; partner sees an abstract "free headroom" indicator.

**Rejected by user**: commitments were artificial; complicates math; user does not actually know commitments in advance.

### v2 — Single space limit + planned/spent
Replaced commitments with a single space-level `monthly_limit`. Used existing `transactions.planned` + `transactions.confirmed_at` to distinguish planned vs actual. Partner sees abstract headroom.

**Rejected by user**: "лимита даже не нужно, просто типа сколько planned на совместные траты и сколько из этого еще осталось или уже потрачено". Headroom rejected as well.

### v3 — Pure shared view (adopted) ✅
- Space has **no limit**, no commitments, no headroom.
- A space is just: name + members + categories + invite tokens.
- Transactions get a `space_id` tag + `space_category_id`.
- Members see all tagged transactions of all members in that space.
- Personal Ledger continues to show user's own shared transactions with a space badge.
- Existing `planned` / `confirmed_at` flags drive Planned vs Spent totals (a small pre-cleanup ticket may normalize them into a single source of truth).

---

## Requirements decisions (from refinement Q&A)

| Question | Decision |
|---|---|
| Wallet model | Shared **view** with tags — not a shared cash pool |
| Inclusion of tx into space | Hybrid: manually tag in personal Ledger OR add via Space view (creates personal tx + auto-tags) |
| Limit on space | **None** — no limit, no commitments |
| Periods to display | Weekly / Monthly / 3-month / Year — all derived from raw tx aggregation |
| Categories | **Space-level** categories (separate from personal categories), shared by all members |
| Multi-space | Yes — user can be in many spaces (couple, friends, parents…) |
| Invite mechanism | Single-use invite link, TTL 7d, no owner approval |
| Visibility (partner sees) | Full details of shared tx (date, amount, description, category) |
| Headroom (free budget) visibility | **None** — out of MVP scope |
| Settle-up (Splitwise-style) | **None** — out of MVP scope |
| Recurring rules | `recurring_rules.space_id` + `space_category_id`; spawned tx inherit |
| Overspend handling | N/A — no limits |
| `planned` + `confirmed_at` | Tech debt — normalize into one source of truth as part of this ticket |
| UX placement | **Context switcher** in Layout (`Personal | Joint: <Name>`) — reuses existing Dashboard/Ledger/Recurring/time-lenses |
| Joint Ledger content | Single feed, all members' shared tx, with author indicator |
| Personal tx in Joint context | Hidden |
| Personal Ledger view of own shared tx | Shown with category and Space badge ("Кафе · Joint:Аня") |
| Notifications | **None** in MVP |

---

## Final data model

```sql
spaces (
  id UUID PK,
  name TEXT,
  owner_user_id UUID FK → auth.users,
  currency TEXT,
  created_at, updated_at
)

space_members (
  space_id UUID FK,
  user_id UUID FK,
  role TEXT CHECK (role IN ('owner','member')),
  joined_at,
  PRIMARY KEY (space_id, user_id)
)

space_categories (
  id UUID PK,
  space_id UUID FK,
  name, color, icon, sort_order
)

space_invites (
  id UUID PK,
  space_id UUID FK,
  token TEXT UNIQUE,
  created_by UUID,
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ NULL,
  used_by_user_id UUID NULL
)

-- existing tables, additive only
ALTER TABLE transactions
  ADD COLUMN space_id UUID NULL FK → spaces,
  ADD COLUMN space_category_id UUID NULL FK → space_categories;

ALTER TABLE recurring_rules
  ADD COLUMN space_id UUID NULL FK → spaces,
  ADD COLUMN space_category_id UUID NULL FK → space_categories;
```

**Invariant**: `space_id IS NULL XOR space_category_id IS NULL` is **not** required — both must be NULL together (personal tx) or both non-NULL (shared tx). Enforce via CHECK constraint.

## RLS sketch

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `transactions` | own OR `space_id ∈ my_spaces` | own only | own only | own only |
| `spaces` | members | authenticated (creator becomes owner) | owner | owner |
| `space_members` | members | via invite consume OR owner | owner (role only) | owner OR self-leave |
| `space_categories` | members | members (decide owner-only later) | members | members |
| `space_invites` | owner | owner | system (consume) | owner |

`my_spaces` resolves via a SQL function: `SELECT space_id FROM space_members WHERE user_id = auth.uid()`.

## Edge cases (parking lot or addressed in Plan)

- **Delete space** (owner only): cascade nulls `space_id`/`space_category_id` on transactions; transactions become personal; partner loses access.
- **Member leaves / kicked**: their past shared tx remain visible to remaining members (still authored by them, just no longer a member).
- **Owner deletes account**: undefined — defer; either auto-transfer ownership or cascade-delete space.
- **Invite link leak**: mitigated by single-use + TTL. No further mitigation in MVP.
- **Two members with same space-category name**: not an issue — categories are space-scoped, not user-scoped.

## Out of MVP (explicit non-goals)

- Per-period budget limits / progress bars
- Personal commitments to a space
- Free-budget headroom visible to other member
- Notifications (toast / push / email)
- Settle-up / debt tracking (Splitwise-style)
- Multi-currency conversion (space currency is single)
- Activity log / undo / audit trail
- Owner transfer / advanced roles

## Related decisions (ADRs)

- [[BUDG-020 - ADR-001 - Space as tag, not separate ledger]] — why we chose the view-over-tag model
- [[BUDG-020 - ADR-002 - Context switcher over separate routes]] — UX integration approach
- [[BUDG-020 - ADR-003 - No commitments or limits in MVP]] — minimalism rationale
