# BUDG-022 - ADR-004 - Dedicated redistribute_shared RPC

*Part of [[BUDG-022]]*

## Status

Accepted — 2026-04-28

## Supersedes

[[BUDG-022 - ADR-003 - Reuse rebalance machinery, no new RPC|ADR-003]] — "reuse `apply_rebalance`, no new RPC".

## Context

ADR-003 assumed `apply_rebalance` was a generic atomic edit primitive. Reading its v2 implementation revealed it isn't:

- The `tx` parameter is **required** — the RPC always upserts one new (or existing) transaction. There's no way to "just update two existing rows" without inventing a no-op insert.
- `tx_updates[*].new_amount` is **always negated** before being written: `update transactions set amount = -new_amount`. Values `≤ 0` **delete** the row. So:
  - Income transactions (amount > 0) cannot be updated through this path — their sign would flip.
  - Setting any amount to exactly zero would silently delete the row.
  - The caller cannot ever pass a positive `amount`.
- The contract is entirely shaped around BUDG-012's "trim or skip a planned expense" use case.

BUDG-022 redistribute needs:

- Atomic update of **two arbitrary** transactions' amounts (signed; both income and expense).
- Optional insert of a brand-new shared event (Phase 3 cross-month / Phase 6 quick-add).
- Optional upsert of a `recurring_overrides` row when the source or destination is a recurring occurrence (Phase 4).
- Strict scoping to `auth.uid()` and to rows the user already owns.

Forcing this through `apply_rebalance` would either silently corrupt income rows or require breaking changes to the v2 contract that BUDG-012 still depends on.

## Decision

Introduce a new SECURITY INVOKER RPC `public.redistribute_shared(payload jsonb)` that accepts three explicit arrays:

```jsonb
{
  "tx_updates":      [{ "id": uuid, "amount": numeric }],
  "tx_inserts":      [{ "occurred_on": date, "amount": numeric, "description": text|null,
                        "category_id": uuid|null, "planned": bool, "is_shared": bool }],
  "override_upserts":[{ "recurring_rule_id": uuid, "occurrence_date": date,
                        "amount_override": numeric|null, "skipped": bool }]
}
```

Semantics:

- `tx_updates`: `update transactions set amount = (value as-is) where id = ...`. **No sign flip, no delete-on-zero.** RLS guarantees the row belongs to the caller.
- `tx_inserts`: insert with `user_id = auth.uid()` and `is_shared = true` enforced by the RPC (caller-supplied `is_shared` ignored — see Consequences).
- `override_upserts`: upsert into `recurring_overrides` with `(recurring_rule_id, occurrence_date)` as the conflict key. RLS again scopes to the caller's rules.

All three lists run in a single function body → one transaction → atomic.

## Consequences

- **Pro** — clean contract, exactly the four BUDG-022 flows expressible:
  | Flow | Payload |
  | --- | --- |
  | Same-month tx → tx | `tx_updates: [{src, src.amount−n}, {dst, dst.amount+n}]` (signs preserved) |
  | Cross-month tx → tx | Same |
  | Recurring → one-off | `override_upserts: [{rule, date, amount_override: orig−n}]` + `tx_inserts: [{...n, is_shared: true}]` |
  | Quick-add | `tx_inserts: [{...}]` only |
- **Pro** — `apply_rebalance` (BUDG-012) stays unchanged. No breaking changes to existing flows.
- **Pro** — RPC enforces `is_shared = true` on every insert, so the redistribute path can never silently leak a private tx into the public bag.
- **Con** — small duplication of insert logic between `apply_rebalance` and `redistribute_shared`. Acceptable: the two have different invariants (one negates, one doesn't; one forces `is_shared`, one doesn't).
- **Con** — caller is fully responsible for sign correctness in `tx_updates`. We document this and rely on TypeScript to keep frontend honest.

## Alternatives considered

- **Extend `apply_rebalance` to v3 with a `mode` flag** — rejected: complexity tax on every BUDG-012 caller for a feature it doesn't need, and the negation behaviour is now load-bearing for that code path.
- **Two raw PostgREST writes (decrement, increment) without RPC** — rejected: not atomic; on partial failure the shared bag becomes inconsistent.
- **One RPC per flow (`transfer_within_month`, `transfer_to_new_event`, …)** — rejected: 4-5 RPCs for the same conceptual operation. Discoverability and security review surface multiplied.
