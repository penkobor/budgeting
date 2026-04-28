# BUDG-021 — Plan

*Part of [[BUDG-021]]*

## Goal

Ship a personal-user-only "publish my plans" feature: any transaction or recurring rule can be flagged `is_shared`; the user owns one share-link with a custom display name; visitors of `/share/:slug` see a read-only page rendering those entries grouped by month in a "<display_name> plans:" narrative.

Concurrently, fully remove BUDG-020's multi-tenant Spaces implementation.

## Non-goals

- Multiple share pages per user (one is enough; future ticket if needed).
- Password / TTL / revoke for share links (slug unguessability is the only gate in MVP).
- Sharing monthly goals from BUDG-012 (only `transactions` + `recurring_rules` are share-eligible).
- Realtime push to viewers (TanStack Query refetch on visibility/poll is acceptable).
- Importing / cloning a shared entry into the viewer's own ledger — explicitly forbidden by design.
- Per-recipient differentiation (no "for partner" vs "for parents" pages).

## Phases

### Phase 1 — Schema migration (one combined SQL file)
- [ ] Create `supabase/migrations/20260428_budg021_supersede_spaces_with_share.sql`:
  - Drop FK / check constraints involving `space_id` / `space_category_id` on `transactions` + `recurring_rules`.
  - Drop columns `space_id`, `space_category_id` on `transactions` + `recurring_rules`.
  - Drop tables (CASCADE): `space_invites`, `space_categories`, `space_members`, `spaces`.
  - Drop RPCs: `consume_space_invite`, `get_space_member_profiles`, `my_space_ids`.
  - Drop now-orphaned RLS policies referencing those tables/columns.
  - Add `is_shared boolean NOT NULL DEFAULT false` on `transactions` + `recurring_rules`.
  - Create table `share_links (user_id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE, slug text UNIQUE NOT NULL, display_name text NOT NULL, created_at timestamptz DEFAULT now())`.
  - RLS on `share_links`: enable; policy "owner full access" `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`.
  - RPC `get_public_share(p_slug text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE`: returns `{ display_name, transactions: [...], recurring_rules: [...] }` for the owner of `p_slug`, filtered to `is_shared = true`. Grant EXECUTE to `anon, authenticated`.
  - Helper for slug generation (RPC `generate_share_slug()` returning a 16-char base32 string) — optional, can also be done client-side.

### Phase 2 — Frontend cleanup (delete BUDG-020)
- [ ] Delete `src/hooks/spaces.ts`.
- [ ] Delete `src/components/ContextSwitcher.tsx`.
- [ ] Delete `src/pages/SpaceDetail.tsx`.
- [ ] Delete `src/pages/InviteAccept.tsx`.
- [ ] Remove `currentSpaceId` + setter from `src/store/ui.ts`.
- [ ] Remove `/spaces/:id` and `/invite/:token` routes from `src/App.tsx`.
- [ ] Strip `currentSpaceId` branching + space badges from:
  - `src/pages/Ledger.tsx`
  - `src/pages/Recurring.tsx`
  - `src/pages/Dashboard.tsx`
  - `src/pages/lenses/*.tsx`
  - `src/components/AddTransactionDialog.tsx`
  - `src/components/Layout.tsx` (remove ContextSwitcher mount)
  - `src/components/CommandPalette.tsx` (drop space-related commands)
- [ ] Remove space columns from `useTransactions` / `useRecurring` queries; keep them returning the user's own rows only.

### Phase 3 — `is_shared` toggle on entries
- [ ] Add a `Shared` checkbox / toggle to:
  - `AddTransactionDialog` (one-off + when creating recurring).
  - Recurring rule edit form on `Recurring.tsx`.
- [ ] Show a small "shared" indicator (icon or chip) on shared rows in Ledger and Recurring lists.
- [ ] Hook `useUpdateTransaction` / `useUpdateRecurring` to toggle the flag inline (long-press / context menu — keep MVP minimal: just include in the existing edit form).

### Phase 4 — Share-link management (own user)
- [ ] `src/hooks/share.ts`:
  - `useShareLink()` — fetches own row; returns `null` if not yet created.
  - `useUpsertShareLink()` — creates with random slug + user-supplied display_name, or updates display_name; cannot change slug after creation (regenerate via separate RPC if asked later).
  - `useDisableShareLink()` — deletes the row.
- [ ] Section inside `src/pages/Settings.tsx` (NOT a separate route):
  - "Share my plans": display_name input, "Enable" button.
  - When enabled: show full URL `https://<host>/share/<slug>`, copy-to-clipboard, "Disable" button.

### Phase 5 — Public viewer page
- [ ] Add route `/share/:slug` to `App.tsx` **outside** the auth `<Gate>` (top-level, before `<Gate>`).
- [ ] `src/pages/PublicShare.tsx`:
  - Calls `supabase.rpc('get_public_share', { p_slug })` via TanStack Query (5-min stale).
  - Empty/404 state if RPC returns null.
  - Renders header `<display_name> plans:` (i18n later).
  - Body: groups entries by `year-month`, sorted ascending, current/future months first; within each month list date — amount — note.
  - Footer per month: "Total in <month>: <sum>".
  - For recurring rules: project upcoming N months (use existing `src/lib/projection.ts` helpers, sharable across pages).
  - No nav / context-switcher / login prompts on this page; minimal layout (own `<PublicLayout>` or inline).

### Phase 6 — Types + verification
- [ ] Regenerate `src/lib/db.types.ts` against updated schema (or hand-patch to match).
- [ ] `npx tsc --noEmit` passes.
- [ ] `npm run lint` passes.
- [ ] Smoke test:
  1. Create a transaction marked shared.
  2. Enable share link in Settings; copy URL.
  3. Open URL in incognito (no auth) — see entry under correct month with correct total.
  4. Toggle entry off shared — disappears on refresh.
  5. Disable share link — public URL returns 404 / empty state.

## Tests

- Unit: `get_public_share` RPC returns only `is_shared=true` rows for the slug owner; returns null for unknown slug; ignores other users' rows.
- Unit: projection used in PublicShare matches existing `src/lib/projection.test.ts` semantics for recurring entries.
- Manual smoke: see Phase 6.

## Open questions

- Should we add a "regenerate slug" RPC in MVP? Decision: **no** — user can disable + re-enable to get a new slug. Re-evaluate after first dogfood.
- Should the public page show currency? Yes — pulled from each transaction's currency (existing column). No conversion.
