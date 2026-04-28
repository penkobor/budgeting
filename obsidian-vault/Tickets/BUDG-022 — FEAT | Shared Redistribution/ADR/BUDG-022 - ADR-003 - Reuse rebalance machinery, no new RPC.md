# BUDG-022 - ADR-003 - Reuse rebalance machinery, no new RPC

*Part of [[BUDG-022]]*

## Status

Superseded by [[BUDG-022 - ADR-004 - Dedicated redistribute_shared RPC|ADR-004]] — 2026-04-28

*Originally accepted 2026-04-28; reversed the same day after reading the actual `apply_rebalance` v2 implementation, which is too BUDG-012-specific (forced sign flip on `tx_updates.new_amount`, mandatory `tx` insert).*

## Context

BUDG-012 already shipped `apply_rebalance(tx_updates jsonb, tx jsonb, overrides jsonb)`: an atomic SECURITY DEFINER RPC that, in one transaction, can:

- update existing transactions' amounts (`tx_updates`)
- insert new planned transactions (`tx`)
- write `recurring_overrides` for skipped/amount-overridden occurrences (`overrides`)

The four BUDG-022 redistribution flows are all expressible in those primitives:

| Flow | What lands in apply_rebalance |
| --- | --- |
| Same-month tx → tx | `tx_updates: [{id: src, amount: src.amount - n}, {id: dst, amount: dst.amount + n}]` |
| Cross-month tx → tx | Same — month is just `occurred_on` on the target row |
| Recurring occurrence → one-off | `overrides: [{rule, occurrence_date, amount_override: orig - n}]` + `tx: [{occurred_on, amount: n, is_shared: true, ...}]` |
| Quick-add new shared event | `tx: [{occurred_on, amount, is_shared: true, ...}]` (no source means no transfer — it's a pure add) |

## Decision

**Do not introduce a new RPC.** Use `apply_rebalance` as the single write path for all four flows. The frontend assembles the appropriate `tx_updates` / `tx` / `overrides` payload and submits it once per drag-release.

The only schema concern: rows created via quick-add must carry `is_shared = true`. `apply_rebalance` already accepts arbitrary `tx` columns — frontend just includes the flag.

## Consequences

- **Pro** — atomicity for free: every redistribute either fully applies or rolls back.
- **Pro** — zero new SQL surface to security-review.
- **Pro** — undo is symmetric: reverse the diff and call `apply_rebalance` again.
- **Con** — `apply_rebalance` was originally designed for the BUDG-012 monthly goal flow, so its parameter names (`tx`, `tx_updates`, `overrides`) read awkwardly outside that context. Document the mapping in the redistribute hook so the next reader doesn't have to re-derive it. Worth a comment, not a rename.
- **Con** — if a future redistribute needs categories or split-amount semantics that `apply_rebalance` doesn't support, we'd have to introduce a new RPC then. Acceptable — YAGNI for now.

## Alternatives considered

- **New `redistribute_shared(transfers jsonb)` RPC** — rejected: pure duplication of `apply_rebalance` with renamed columns.
- **Two PostgREST writes (one decrement, one increment)** — rejected: not atomic; on failure the bag becomes inconsistent.
