# BUDG-020 — 2026-04-27 — Phase 2 hooks + Phase 3 spaces UI

*Part of [[BUDG-020]]*

## What

- Phase 2: wrote all TanStack Query hooks for Spaces in `src/hooks/spaces.ts`.
- Phase 3: wired Spaces management UI (Settings entry, Space detail page, invite-accept route).

## Phase 2 — hooks (`src/hooks/spaces.ts`)

Exports:

- **Spaces**: `useSpaces`, `useSpace(id)`, `useCreateSpace`, `useUpdateSpace`, `useDeleteSpace`.
- **Members**: `useSpaceMembers`, `useLeaveSpace`, `useKickMember`.
- **Categories**: `useSpaceCategories`, `useUpsertSpaceCategory`, `useDeleteSpaceCategory`.
- **Invites**: `useSpaceInvites`, `useGenerateInvite` (default TTL 7d, base64url 16-byte token), `useRevokeInvite`, `useConsumeInvite` (calls `consume_space_invite` RPC).
- **Helper**: `buildInviteUrl(token)` — assembles HashRouter URL `https://host/#/invite/<token>`.

Notes:
- `useDeleteSpace` invalidates `transactions` and `recurring_rules` keys because deleting a space nulls `space_id` on those rows (FK ON DELETE SET NULL → tx becomes personal).
- All query keys consistently scoped per space id where relevant.

## Phase 3 — UI (delegated to subagent)

Files created:
- `src/pages/SpaceDetail.tsx` — header, members list with kick, categories CRUD with color picker, invites list with copy/revoke + generate, danger-zone (delete-as-owner / leave-as-member).
- `src/pages/InviteAccept.tsx` — handles `/invite/:token`, calls `useConsumeInvite` on mount, shows loading/success/error states.

Files modified:
- `src/pages/Settings.tsx` — added "Shared spaces" section (between Categories and Build) with list of `useSpaces()` and a Create-space modal that navigates to the new space on success.
- `src/App.tsx` — added routes `/spaces/:id` → `SpaceDetailPage`, `/invite/:token` → `InviteAcceptPage` inside the `<Gate>` route block.

Subagent decisions documented:
- Members are displayed by truncated `user_id` (no profile/email join yet — pending Phase 4 prep).
- Invite-not-signed-in branch deferred (Gate prevents that path; can add `pendingInviteToken` localStorage later when AuthPage learns about deep links).
- Used native `<input type="color">` for space category color (vs. PALETTE swatches in personal Categories) — minimalist consistent UX.
- `navigator.clipboard.writeText` used for copy-invite, with graceful fallback toast if rejected.

## Validation
- `npx tsc -p tsconfig.app.json --noEmit` → clean.
- `npx vitest run` → 15/15 tests pass.

## Phase 4 prep / open
- Need a way to display member emails or display names. Either:
  (a) a public `profiles` view exposing `id, email` filtered through RLS to space-members,
  (b) or join `auth.users` server-side via SECURITY DEFINER function returning `(user_id, email)` for members of caller's spaces.
  → Decide before writing the context switcher; member-friendly names are also useful in the Joint Ledger author indicator (Phase 5).
- Context switcher in `Layout` to consume `useSpaces()` and persist `currentSpaceId` in `useUi` (zustand).
- `SpaceDetailPage` is reachable from `/settings`; once context switcher exists, also add a "Manage" gear icon shortcut from the switcher dropdown.

## Next session
- Phase 4: context switcher + `currentSpaceId` global state.
- Phase 5: thread `currentSpaceId` through Dashboard, Ledger, Recurring, time-lenses queries.
- Optional: address Phase 0 (planned/confirmed_at normalization) before Phase 5 to avoid duplicating handling logic in space-aware aggregations.
