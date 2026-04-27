# BUDG-020 — 2026-04-27 — Refinement + Phase 1 schema migration

*Part of [[BUDG-020]]*

## What

- Refined requirements for Shared Budget Spaces from rough idea → concrete MVP scope (model evolution v1 → v3, captured in [[BUDG-020 - Refinement Discussion]]).
- Created ticket scaffolding in vault: index, Plan, Analysis, three ADRs.
- Wrote Phase 1 migration: `supabase/migrations/20260427_budg020_phase1_spaces_schema.sql`.
- Wrote consume-invite RPC: `supabase/migrations/20260427_budg020_consume_invite_rpc.sql`.

## Decisions captured

- ADR-001: Space-as-tag (not separate ledger).
- ADR-002: Context switcher in Layout (not separate routes).
- ADR-003: No commitments / no limits / no headroom in MVP.

## Migration design notes

### Tables created
- `spaces` — name, owner, currency.
- `space_members` — composite PK `(space_id, user_id)`, role `owner|member`.
- `space_categories` — space-scoped (separate from personal `categories`).
- `space_invites` — single-use, time-limited tokens.

### Schema additions
- `transactions.space_id`, `transactions.space_category_id` — both nullable.
- `recurring_rules.space_id`, `recurring_rules.space_category_id` — both nullable.
- CHECK constraint `(space_id IS NULL) = (space_category_id IS NULL)` on both tables — prevents tagging a tx as shared without a space category, and vice-versa.

### RLS strategy
- New `my_space_ids()` SECURITY DEFINER function returns spaces the caller is a member of. Used inside policies (avoids recursion when querying `space_members` from inside `space_members` RLS).
- Added a NEW permissive SELECT policy on `transactions` and `recurring_rules` that allows reading shared rows of other users where `space_id IN (my_space_ids())`. Existing owner-only policies are left intact — Postgres OR-combines permissive policies, so members can read shared tx OR their own rows.
- INSERT/UPDATE/DELETE on transactions remain owner-only — the "you can't mutate another user's tx" invariant is preserved by *not* adding any new mutation policy.
- `space_members` INSERT direct path is owner-only; member self-add happens via SECURITY DEFINER `consume_space_invite(token)` RPC which bypasses RLS to atomically validate the token and insert the row.
- `space_categories` writes: members-only (revisit if abuse — see Plan open questions).

### Triggers
- `spaces_add_owner_member_trg` — after-insert on `spaces` automatically inserts an `owner` row into `space_members`.
- Reuses existing `public.set_updated_at()` from BUDG-012.

### Out of this migration
- `db.types.ts` regen — needs Supabase CLI / MCP run after applying.
- Phase 0 cleanup of `planned`/`confirmed_at` redundancy — separate decision pending.

## Applied (this session)
- Both migrations applied via Supabase MCP `apply_migration`:
  - `budg020_phase1_spaces_schema` — 4 new tables, 2 column additions, 14 RLS policies, 2 functions, 1 trigger.
  - `budg020_consume_invite_rpc` — token-validating RPC for joining a space.
  - `budg020_revoke_trigger_fn_exec` — revoked EXECUTE on `spaces_add_owner_member()` (trigger-only function should not be REST-callable).
- Regenerated `src/lib/db.types.ts` via `mcp_supabase_generate_typescript_types`. Restored manually-maintained convenience aliases (`Transaction`, `Category`, etc.) that the generator does not produce, plus added new `Space*` aliases.
- `npx tsc -p tsconfig.app.json --noEmit` → clean.
- `npx vitest run` → 15 tests pass.

## Advisor warnings (reviewed, not actioned)
- `my_space_ids()` and `consume_space_invite()` flagged as exposed `SECURITY DEFINER` functions to anon/authenticated. **Intentional**:
  - `consume_space_invite` is the public API for joining (anon may attempt; we reject inside).
  - `my_space_ids` returns only the caller's own membership rows (uses `auth.uid()` internally) — exposing it via REST leaks no information beyond what the caller can already query directly.
- `auth_leaked_password_protection` — project-level setting unrelated to BUDG-020.
- `assets_set_updated_at` mutable search_path — pre-existing from BUDG-013, not in scope.

## Next session
- Phase 2: write hooks (`useSpaces`, `useSpace`, `useSpaceCategories`, `useCreateSpace`, `useGenerateInvite`, `useConsumeInvite`, `useLeaveSpace`).
- Decide Phase 0 split-out: keep inside BUDG-020 or fork as BUDG-019 (planned/confirmed_at normalization).
- Consider creating `feature/budg-020-shared-budget-spaces` branch and committing Phase 1 work.
