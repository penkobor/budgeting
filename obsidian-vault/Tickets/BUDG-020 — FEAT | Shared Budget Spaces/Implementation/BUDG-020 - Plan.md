# BUDG-020 — Plan | Shared Budget Spaces

*Part of [[BUDG-020]]*

## Goal
Implement multi-space shared budget tagging on top of personal ledgers, with a Context Switcher UX integration. No limits, no commitments, no notifications in MVP. See [[BUDG-020 - Refinement Discussion]] for the full model rationale.

## Non-goals (MVP)
- Per-space monetary limits or progress bars against a limit
- Per-member commitments
- Free-budget headroom visibility to other members
- Notifications of any kind
- Settle-up / debt tracking
- Multi-currency conversion

## Phasing

### Phase 0 — Pre-cleanup: normalize planned/confirmed_at
*Tech-debt ticket inside the larger ticket. Could be split out as BUDG-019 if it grows.*

- [ ] Audit usage of `transactions.planned` (boolean) vs `transactions.confirmed_at` (timestamp) across codebase.
- [ ] Decide single source of truth: drop `planned`, use `confirmed_at IS NULL` ⇒ planned, else spent. Or keep `planned` and drop `confirmed_at`. ADR-candidate.
- [ ] Migration to drop the redundant column.
- [ ] Update all queries, projections, and UI.
- [ ] Tests pass.

### Phase 1 — Schema + RLS
- [ ] Migration: create `spaces`, `space_members`, `space_categories`, `space_invites`.
- [ ] Migration: add `space_id`, `space_category_id` to `transactions` and `recurring_rules` (nullable, FK).
- [ ] CHECK constraint: `(space_id IS NULL) = (space_category_id IS NULL)` on both tables.
- [ ] RLS policies (see Refinement Discussion → "RLS sketch"):
  - [ ] `my_spaces()` SECURITY DEFINER helper function.
  - [ ] `transactions` SELECT: `user_id = auth.uid() OR space_id IN (SELECT my_spaces())`.
  - [ ] `transactions` INSERT/UPDATE/DELETE: `user_id = auth.uid()`.
  - [ ] `spaces`/`space_members`/`space_categories`/`space_invites` policies.
- [ ] Trigger: on `space_invites` consume → insert `space_members` row + mark invite used.
- [ ] Trigger: on `spaces` insert → auto-create `space_members(owner)` row for creator.
- [ ] Update `db.types.ts` (regen via Supabase).

### Phase 2 — Backend hooks (RTK Query / TanStack Query)
- [ ] `useSpaces()` — list spaces user is a member of.
- [ ] `useSpace(id)` — single space details + members.
- [ ] `useSpaceCategories(spaceId)`.
- [ ] `useCreateSpace`, `useRenameSpace`, `useDeleteSpace`.
- [ ] `useGenerateInvite(spaceId)`, `useConsumeInvite(token)`.
- [ ] `useLeaveSpace(spaceId)`.
- [ ] Existing `useTransactions` / `useRecurring` hooks accept optional `spaceId` filter.
- [ ] `useCreateSpaceCategory`, `useUpdateSpaceCategory`, `useDeleteSpaceCategory`.

### Phase 3 — Core UX (Spaces management)
- [ ] Settings → "Spaces" section: list, create, rename, leave, delete.
- [ ] Create-space modal (name, currency).
- [ ] Space settings page: members list, categories CRUD, invite link generation, danger zone (leave/delete).
- [ ] Invite consume route: `/invite/:token` → on click, validates token → consumes → redirects to space.
- [ ] Empty states: "no spaces yet" + CTA to create.

### Phase 4 — Context switcher integration
- [ ] `useUi` store: add `currentSpaceId: string | null` (null = Personal).
- [ ] `Layout`: context-switcher pill (sidebar desktop, header pill mobile) showing current context with dropdown.
- [ ] Visual cue: when in Joint context, accent color shifts to space-specific color (or generic "joint" color).
- [ ] Wire `currentSpaceId` into Dashboard, Ledger, Recurring, time-lenses queries.
- [ ] Settings/Assets routes always Personal — disable context switcher there or auto-switch.

### Phase 5 — Per-screen integration
- [ ] **Ledger (Personal)**: shared tx rendered with space badge `Кафе · Joint:Аня` (clickable → switches context).
- [ ] **Ledger (Joint)**: filtered to `space_id = currentSpaceId`, includes all members' tx, author indicator avatar/initial.
- [ ] **Dashboard (Joint)**: replace personal MonthLens hero with space stats (planned, spent, remaining-of-planned per period).
- [ ] **Recurring (Joint)**: filtered to space; create/edit forms preselect `space_id`.
- [ ] **Time-lenses (Joint)**: aggregate over shared tx of current space.
- [ ] **AddTransactionDialog**: context-aware preselect; in Joint context, category selector shows space categories; explicit toggle "make this shared" appears in Personal context.

### Phase 6 — Polish + edge cases
- [x] Delete space: confirm dialog ("transactions will become personal"); migration nulls `space_id` on members' tx.
- [x] Member leaves: confirm dialog; transactions remain visible to remaining members.
- [x] Convert existing personal tx to shared (and back) from tx detail.
- [x] Owner cannot leave without transferring ownership (or must delete the space). *(UI hides Leave for owners and shows Delete instead — equivalent guarantee for MVP.)*
- [x] Invite link UI: copy-to-clipboard, show TTL countdown, regenerate.
- [x] Empty states across all screens in Joint context.
- [x] **Bugfix:** explicit `owner_user_id` / `created_by` in `useCreateSpace` / `useGenerateInvite` (RLS WITH CHECK was failing in prod when relying on column default `auth.uid()`).

### Phase 7 — Tests + docs
- [ ] RLS tests via `supabase test db`: members can read each other's shared tx; cannot read personal; cannot write.
- [ ] Unit: aggregations / projections over shared tx.
- [ ] E2E happy path: create space → invite → second user joins → both add shared tx → both see them in respective contexts.
- [ ] README / Settings help section: how Spaces work.
- [ ] Update [[BUDG-020]] index with QA notes.

## Open questions (resolve during implementation)
- Should `space_categories` writes be members-only or owner-only? (Defaulting to members-only; revisit if abuse.)
- Color palette per space (auto-assigned vs user-pickable on create).
- Mobile context-switcher placement: header vs FAB-adjacent vs in floating nav pill.
- Visual identity of authorship on shared tx: avatar / initial circle / colored bar.

## Migration considerations
- All new columns are nullable → existing tx unaffected.
- No backfill needed — existing tx remain personal.
- RLS policies must be additive; do not break existing personal-only access.

## Estimated phases
Skipping concrete time estimates per repo convention. Phase 0 should not block Phase 1 if planned/confirmed_at cleanup is split out.
