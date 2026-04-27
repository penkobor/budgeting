# BUDG-020 — 2026-04-27 — Phase 6 polish + RLS create-space bugfix

*Part of [[BUDG-020]]*

## Summary
Closed Phase 6 (Polish + edge cases). Also fixed a P1 bug discovered in
production while testing space creation.

## Bug — `new row violates row-level security policy for table "spaces"`
- **Repro:** in prod (`https://penkobor.github.io/`), Settings → Create
  space → toast `new row violates row-level security policy for table
  "spaces"`. PostgREST request body: `{"name":"Shrd","currency":"Kč"}`.
- **Root cause:** the `spaces` table has
  `owner_user_id uuid not null default auth.uid()` and the INSERT RLS
  policy is `with check (owner_user_id = auth.uid())`. The client
  omitted `owner_user_id`, expecting the default to fire. In some
  PostgREST configurations (still investigating exact trigger), the
  WITH CHECK is evaluated *before* defaults are applied, so the row
  fails the policy with `owner_user_id IS NULL`.
- **Fix:** explicitly set `owner_user_id` from `supabase.auth.getUser()`
  in `useCreateSpace`. Same defensive pattern applied to
  `useGenerateInvite` (`created_by` has the same default + WITH CHECK
  combo on `space_invites`).
- **Files:** `src/hooks/spaces.ts`.

## Phase 6 — Polish

### Edit-tx convert personal ↔ shared
- `AddTransactionDialog` previously hid the "Make this shared" toggle in
  edit mode (`!editId` guard). Removed the guard so an existing
  personal tx can be promoted to a space, and a shared tx can be
  demoted back or moved to a different space.
- New prop `initialSpaceId?: string | null` so callers can seed the
  form when editing a shared tx (otherwise the toggle defaults to OFF
  even though the tx is shared).
- Reset effect seeds `makeShared` and `pickedSpaceId` from
  `initialSpaceId`.
- `Ledger` (edit dialog) and `TodayLens` (edit dialog) now pass:
  - `initialCategoryId={editing.space_category_id ?? editing.category_id}`
  - `initialSpaceId={editing.space_id}`
- Submit path was already correct: it picks `space_id`,
  `space_category_id`, and clears `category_id` based on `targetSpaceId`,
  honouring the `(space_id IS NULL) = (space_category_id IS NULL)`
  CHECK constraint.

### Empty states in Joint context
- **Ledger:** when `currentSpaceId` is set and both `txs` and `rules`
  are empty for the month, render a hint card above the day grid
  pointing at the "Make this shared" toggle.
- **Recurring:** empty-state copy adapts — joint context says
  *"No shared recurring rules in &lt;space&gt; yet"* with a CTA suited
  for joint subscriptions / repeating bills.
- **TodayLens:** existing "Nothing planned" copy already reads cleanly
  in both contexts; left as-is.

### Already shipped earlier in BUDG-020 phases (closed off in plan)
- Delete-space confirm dialog (`SpaceDetail`).
- Leave-space confirm dialog. Owners only see Delete (no Leave button)
  → owner-can't-orphan-space invariant holds without a separate
  ownership-transfer flow.
- Invite UI: copy link, TTL countdown via `formatExpiry`, generate
  button (regenerate = generate new), used/expired collapsed group.

## Phase 7 — deferred
Out of today's scope per user choice ("Только Phase 6 polish"):
- RLS tests via `supabase test db` — no test infra in repo.
- E2E happy path — no Playwright/Cypress in repo.
- README / Settings help section about Spaces.

## Files changed
- `src/hooks/spaces.ts` — explicit `owner_user_id` / `created_by`.
- `src/components/AddTransactionDialog.tsx` — `initialSpaceId` prop,
  toggle visible in edit mode, seeded reset.
- `src/pages/Ledger.tsx` — pass space info on edit; joint-empty hint.
- `src/pages/lenses/TodayLens.tsx` — pass space info on edit.
- `src/pages/Recurring.tsx` — joint-aware empty-state copy.

## Follow-ups
- Verify the prod fix once deployed (create a new space, generate an
  invite). If the column-default path still misbehaves, file a Supabase
  support ticket with the request/response captured today.
- Phase 7 docs + tests when prioritised.
