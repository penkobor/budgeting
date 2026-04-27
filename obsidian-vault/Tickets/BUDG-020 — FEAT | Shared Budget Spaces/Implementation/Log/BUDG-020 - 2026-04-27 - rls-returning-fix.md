---
date: 2026-04-27
ticket: BUDG-020
session: rls-returning-fix
---

*Part of [[BUDG-020]]*

# RLS fix: `INSERT INTO spaces ... RETURNING *` failed with 42501

## Symptom
PostgREST `POST /rest/v1/spaces` with `Prefer: return=representation` returned:
```json
{ "code": "42501", "message": "new row violates row-level security policy for table \"spaces\"" }
```
Body sent the correct `owner_user_id` matching `auth.uid()`, so the `INSERT WITH CHECK (owner_user_id = auth.uid())` policy clearly should have passed.

## Root cause
PostgREST's `Prefer: return=representation` adds `RETURNING *` to the INSERT. In Postgres, when an `INSERT ... RETURNING` runs against an RLS-protected table, **both** the INSERT WITH CHECK policy **and** the SELECT USING policy are evaluated against the new row.

Original SELECT policy:
```sql
using (id in (select public.my_space_ids()))
```
`my_space_ids()` reads from `space_members`. Owner membership is added by the `spaces_add_owner_member_trg` AFTER INSERT trigger — which fires **after** the RETURNING SELECT visibility check. Result: the just-inserted row was invisible to the inserting user, and Postgres reports the failure as a generic RLS violation on the table.

Reproduced in SQL:
- Same INSERT **without** `RETURNING *` → succeeds.
- Same INSERT **with** `RETURNING *` → 42501.

## Fix
Migration `budg020_fix_spaces_select_policy_for_owner` — extend the SELECT policy to allow the owner directly, independent of `space_members`:

```sql
drop policy if exists "spaces: members can select" on public.spaces;
create policy "spaces: members can select"
  on public.spaces for select
  using (
    owner_user_id = auth.uid()
    or id in (select public.my_space_ids())
  );
```

Also patched the source migration `20260427_budg020_phase1_spaces_schema.sql` so a future `supabase db reset` reproduces the fix.

## Verification
Re-ran the INSERT with `RETURNING *` under `set local role authenticated` + matching `request.jwt.claims.sub` → row returned, no error.

## Lesson (candidate for `Learnings/Patterns/`)
Whenever a Supabase table relies on an AFTER INSERT trigger to populate the membership row that the SELECT policy depends on, `Prefer: return=representation` will break inserts. Either:
1. include the owner directly in the SELECT policy (chosen here), or
2. use a BEFORE INSERT trigger that populates membership before RETURNING's SELECT check, or
3. wrap creation in a SECURITY DEFINER RPC.

---

## Follow-up: relaxed `transactions_space_consistency_chk`

After the RLS fix, a second curl failed with `23514` on transactions — the original constraint required `(space_id IS NULL) = (space_category_id IS NULL)`, but generating a shared transaction from a recurring rule whose `space_category_id` was null hit it. That was also inconsistent with personal transactions where `category_id` is freely nullable.

Migration `budg020_relax_space_consistency_chk` weakens both checks (transactions + recurring_rules) to:
```sql
check (space_category_id is null or space_id is not null)
```
Meaning: a `space_category_id` is only meaningful when the row is shared, but a shared row MAY be uncategorized. Source migration `20260427_budg020_phase1_spaces_schema.sql` updated to match.
