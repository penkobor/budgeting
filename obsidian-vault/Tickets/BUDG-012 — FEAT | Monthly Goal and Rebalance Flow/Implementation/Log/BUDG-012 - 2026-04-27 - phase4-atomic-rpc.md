# BUDG-012 — 2026-04-27 — phase4-atomic-rpc

*Part of [[BUDG-012]]*

## Goal for this session
Replace the sequential client-side mutation (overrides upsert → tx upsert)
with a single Postgres RPC, so apply-rebalance is atomic — no risk of
overrides applied without the corresponding transaction (or vice versa).

## Execution

### 1. RPC `public.apply_rebalance(tx jsonb, overrides jsonb) returns transactions`
Applied via Supabase MCP `apply_migration`. Local copy:
[`supabase/migrations/20260427_budg012_apply_rebalance_rpc.sql`](../../../../supabase/migrations/20260427_budg012_apply_rebalance_rpc.sql).

Behaviour:
- Single PL/pgSQL function with `SECURITY INVOKER` so RLS still enforces
  ownership on every row.
- `set search_path = public, pg_temp` to keep the security advisor happy.
- Inserts (or updates if `id` provided) the transaction.
- Iterates `jsonb_array_elements(overrides)`, upserting each on
  `(recurring_rule_id, occurrence_date)` conflict.
- Returns the inserted transaction row.
- `revoke all from public; grant execute to authenticated;`.

The whole function body runs in a single transaction (PL/pgSQL implicit
block), so a failure on any override aborts the tx insert too — atomicity
guaranteed.

### 2. `useApplyRebalance()` hook in `queries.ts`
Wraps `supabase.rpc('apply_rebalance', { tx, overrides })`. Invalidates
both the `transactions` and `recurring_overrides` query keys on success.

### 3. `db.types.ts`
Added `Functions.apply_rebalance` typing so the generated `rpc()` call
flows through the typed client.

### 4. `AddTransactionDialog.tsx`
Replaced the sequential
`upsertOverrides.mutateAsync(...) → upsertTx.mutateAsync(...)` with a
single `applyRebalanceMutation.mutateAsync({ tx, overrides })`.
"Save anyway" still uses the regular `upsertTx` because there are no
overrides on that path.

## Verification
- `npm run build` PASS.
- Supabase advisors clean for the new function (no new warnings; only
  pre-existing `handle_new_user` SECURITY DEFINER + auth.leaked-password —
  both predate BUDG-012).

## Outcome
Closes Phase 4 and ST5 (atomic apply mutation) of [[BUDG-012 - Plan]].

Phase 5 (polish — dashboard alert ribbon when goal exceeded, override-
trim badges on Recurring page list, success toast, distribution-math
unit tests) remains.

## Notes
- We don't yet implement client-side optimistic update + rollback. RQ
  invalidates after success; on failure the cache stays consistent
  because nothing was mutated locally before the RPC. Could add
  optimistic UI in Phase 5 for the "Applying…" feel, but not required
  for correctness.
