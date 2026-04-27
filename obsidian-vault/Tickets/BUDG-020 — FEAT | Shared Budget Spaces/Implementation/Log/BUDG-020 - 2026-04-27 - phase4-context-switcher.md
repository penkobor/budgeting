# BUDG-020 — 2026-04-27 — Phase 4 context switcher

*Part of [[BUDG-020]]*

## What
Wired a global Personal/Joint context switcher into the Layout. Selected context lives in `useUi` (zustand, persisted) as `currentSpaceId`. Downstream screens (Phase 5) will read it to filter their data.

## Files modified
- `src/store/ui.ts` — added `currentSpaceId: string | null` + `setCurrentSpaceId` to the persisted UI store.
- `src/hooks/spaces.ts` — `useDeleteSpace` and `useLeaveSpace` now snap `currentSpaceId` back to `null` if the active space is the one being removed (via `useUi.getState()` inside `onSuccess`).
- `src/components/Layout.tsx` — added `ContextSwitcher` slot in two places:
  - Desktop sidebar: between the brand block and the nav links.
  - Mobile: floating pill at top-right, anchored under the safe-area inset.

## Files created
- `src/components/ContextSwitcher.tsx` — dropdown with two visual variants (`sidebar` and `header`).
  - Trigger label: "Personal" or "Joint: {name}", with `User`/`Users` icon.
  - When in Joint context, trigger uses accent color border to make context obvious.
  - Dropdown shows Personal first, then all spaces (each with a per-row gear icon → navigates to `/spaces/:id`), separator, "Manage spaces…" link to `/settings`.
  - Closes on outside-click or Escape.
  - Self-heals: if the persisted `currentSpaceId` no longer matches a known space (e.g. user signed out + into another account), snaps back to Personal.

## Notes
- The switcher is always rendered, including on Settings/Assets routes. Phase 5 decides per-screen whether to honour or ignore the context (Settings is always personal).
- Mobile placement uses an absolute pill rather than carving space in the bottom nav (which is already at the 5-item limit and is concentric with the iPhone home indicator). The pill sits beside the Dynamic Island safe area and doesn't push main content.
- No external clicks logic via Radix — kept lightweight with a `useRef` + `mousedown` listener; consistent with the existing CommandPalette pattern.

## Validation
- `npx tsc -p tsconfig.app.json --noEmit` → clean.
- `npx vitest run` → 15/15 pass.

## Phase 5 prep / open
- `currentSpaceId` is now globally readable via `useUi`. Phase 5 work:
  - Dashboard / Ledger / Recurring / time-lenses queries — pass `currentSpaceId` and switch their `queryFn` between personal (`space_id IS NULL` AND `user_id = me`) and joint (`space_id = currentSpaceId`).
  - Categories selectors in `AddTransactionDialog` should swap to `useSpaceCategories(currentSpaceId)` when in Joint context.
  - Personal Ledger should also render shared tx with a Space badge — needs `useSpaces()` for badge labels.
- Profile-name resolution (members displayed as truncated user_id) is still pending — easier if done before Phase 5 polish in Joint Ledger author indicators.

## Next session
- Phase 5: thread `currentSpaceId` through all screens.
- Or address profile-name resolution first via SECURITY DEFINER `get_space_member_profiles()` RPC.
