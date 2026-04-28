# BUDG-022 - 2026-04-28 - phase2-dnd-same-month

*Part of [[BUDG-022]]*

## Session goal

Phase 2 from [[BUDG-022 - Plan]]: drag-and-drop redistribution between two `is_shared = true` planned transactions in the same month.

## Discovery — apply_rebalance is unsuitable

Reading `supabase/migrations/20260427_budg012_apply_rebalance_v2.sql` revealed that `apply_rebalance` is too BUDG-012-specific to back BUDG-022:

- Its `tx` parameter is mandatory — every call must upsert one new (or existing) transaction.
- `tx_updates[*].new_amount` is unconditionally negated: `update transactions set amount = -new_amount`. Values `≤ 0` delete the row.

That contract corrupts income transactions (sign flip) and forbids "just update two rows without inserting anything". ADR-003 (which had committed us to reusing `apply_rebalance`) was therefore superseded.

## Decisions

- New ADR [[BUDG-022 - ADR-004 - Dedicated redistribute_shared RPC]] — introduces a small, dedicated SECURITY INVOKER RPC.
- ADR-003 marked Superseded.

## What landed

### Backend

- New migration [supabase/migrations/20260428_budg022_redistribute_shared_rpc.sql](supabase/migrations/20260428_budg022_redistribute_shared_rpc.sql).
- RPC `redistribute_shared(payload jsonb)` accepts `{tx_updates, tx_inserts, override_upserts}`:
  - `tx_updates`: writes `amount` as-is (no sign flip, no auto-delete).
  - `tx_inserts`: inserts with `is_shared = true` enforced server-side.
  - `override_upserts`: upserts `recurring_overrides` on `(rule_id, occurrence_date)`.
- Atomic (single function body, single transaction).
- Granted to `authenticated`; `revoke all` from `public`.
- Applied to live Supabase via `mcp_supabase_apply_migration`.

### Frontend

- New hook `useRedistributeShared` in [src/hooks/share.ts](src/hooks/share.ts) with a typed `RedistributePayload` interface. Invalidates `transactions`, `recurring_overrides`, and `public_share` on success.
- [src/pages/lenses/SharedLens.tsx](src/pages/lenses/SharedLens.tsx) rewritten to add Phase 2 DnD:
  - Each row's amount chip is a `motion.span` with `drag="x"` + `dragSnapToOrigin`.
  - On drag, `document.elementFromPoint` resolves the row beneath the pointer; matching rows highlight green for valid, red for invalid (different kind / different month / recurring source).
  - Slider appears under the source row's month while dragging; max = `|src.amount|`; step = `max / 100` clamped to ≥1.
  - On drag end, payload is `{tx_updates: [{src.id, src.amount ∓ n}, {dst.id, dst.amount ± n}]}` — signs preserved on both sides.
- Validation: same month + same income/expense kind + both `tx` source. Recurring → Phase 4. Cross-month → Phase 3.
- Toast on success / error via existing `pushToast`.

### Generated types

- Regenerated `src/lib/db.types.ts` to include the new RPC.

## Build / lint state

- `npm run build` passes (vite + tsc -b).
- No new lint errors. Pre-existing baseline unchanged.

## Manual smoke (to do)

1. Mark two shared expense txs in the same month.
2. Open Dashboard → Shared lens.
3. Drag chip from one onto the other → row turns green → release after scrubbing slider to e.g. 50% of source.
4. Both rows update; toast confirms; refresh `/share/:slug` and verify the public page reflects the new amounts.

## Next session

- Phase 3: cross-month + drop-on-empty-zone (auto-scroll, "+" drop tile per month).
- Phase 4: recurring source → `override_upserts` payload.
- Phase 5: long-press fallback for mobile.
