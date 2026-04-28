# BUDG-021 — 2026-04-28 — Pivot from BUDG-020 and rebuild as Public Share Page

*Part of [[BUDG-021]]*

**Branch:** working tree on `main`
**Status:** All 6 phases of [[BUDG-021 - Plan]] applied to source. Migration NOT yet applied to Supabase.

## Outcome

Pivoted from the multi-tenant Spaces design (BUDG-020) to a single read-only public share page. All 4 BUDG-020 tables, 3 RPCs, RLS policies, and `space_id` columns will be dropped by the new migration `20260428_budg021_supersede_spaces_with_share.sql`. Two new columns `transactions.is_shared` / `recurring_rules.is_shared` plus `share_links` table and `get_public_share(slug)` RPC are added in the same migration.

User-facing surface:

- Settings → "Share my plans" section: enable / disable, set display name, copy public URL.
- AddTransactionDialog and Recurring rule form: "Show on my public share page" toggle.
- Ledger row + Recurring list: small `shared` chip on rows where the flag is on.
- Public viewer at `#/share/:slug` (HashRouter), mounted **outside** the auth gate. Renders `<display_name> plans:` followed by entries grouped by year-month with per-month totals; recurring rules projected 6 months forward.

Final tsc/lint state: `npx tsc --noEmit` clean. ESLint: 12 problems (7 errors, 5 warnings) — all pre-existing patterns flagged by React 19 strict rules; baseline before this work was 13 problems / 8 errors. No new regressions introduced by this session.

## What changed

### Vault
- New ADR [[BUDG-020 - ADR-004 - Supersede Spaces with read-only public share page]] (supersedes ADR-001/002/003).
- BUDG-020 status → **Superseded by [[BUDG-021]]**; ADR-001/002/003 status → "Superseded by ADR-004".
- New ticket folder [[BUDG-021]] with full subfolder skeleton; [[BUDG-021 - Plan]] (6 phases).
- [[00 Vault Index]] updated.

### Database (migration file only — not yet applied)
- [supabase/migrations/20260428_budg021_supersede_spaces_with_share.sql](../../../../../supabase/migrations/20260428_budg021_supersede_spaces_with_share.sql)
  - Drops: 4 space tables, 3 RPCs, related RLS policies, `space_id`/`space_category_id` columns + check constraints + indexes.
  - Adds: `transactions.is_shared`, `recurring_rules.is_shared` (+ partial indexes for shared rows).
  - Adds: `share_links` table (PK = `user_id`, unique slug, display_name 1–80 chars, RLS owner-only).
  - Adds: `get_public_share(p_slug text) RETURNS jsonb` SECURITY DEFINER RPC, granted to `anon, authenticated`.

### Frontend — deletions (Phase 2)
- `src/hooks/spaces.ts`
- `src/components/ContextSwitcher.tsx`
- `src/pages/SpaceDetail.tsx`
- `src/pages/InviteAccept.tsx`

### Frontend — modifications (Phase 2)
- `src/store/ui.ts` — removed `currentSpaceId` / `setCurrentSpaceId`.
- `src/App.tsx` — dropped imports + `/spaces/:id` and `/invite/:token` routes (later in Phase 5 added `/share/:slug` outside Gate).
- `src/components/Layout.tsx` — removed ContextSwitcher mount (sidebar + mobile header).
- `src/hooks/queries.ts` — `useRecurringRules` and `useTransactionsInRange` no longer take opts; deleted `useAllSpaceCategoriesForMe`; simplified `useMonthlyOpening`.
- `src/pages/Settings.tsx` — removed Shared spaces section + create-space modal.
- `src/pages/Ledger.tsx` — stripped joint-context maps, badges, jointEmpty banner.
- `src/pages/Recurring.tsx` — rewrote `RuleForm` as personal-only.
- `src/components/AddTransactionDialog.tsx` — dropped initialSpaceId, makeShared/pickedSpaceId, share-toggle, joint title.
- All four lenses (`Today / Week / Month / Forecast`) and `PlanLens` — stripped joint branches.
- `src/components/GoalAlertRibbon.tsx` — removed `currentSpaceId` ref.
- `src/lib/db.types.ts` — hand-patched: removed BUDG-020 tables, `space_*` columns, BUDG-020 RPCs; added `is_shared` to transactions/recurring_rules; added `share_links` table type and `get_public_share` RPC type. New aliases `ShareLink`, `ShareLinkInsert`.

### Frontend — new (Phases 3–5)
- `src/components/AddTransactionDialog.tsx` — added `initialIsShared` prop, `isShared` state, "Show on my public share page" checkbox, payload now writes `is_shared`.
- `src/pages/Recurring.tsx` — `is_shared` toggle in `RuleForm`, `shared` chip in rule list.
- `src/pages/Ledger.tsx` — `shared` chip on tx rows, passes `initialIsShared` when editing.
- `src/hooks/share.ts` — `useShareLink`, `useUpsertShareLink`, `useDisableShareLink`, `usePublicShare`, `buildShareUrl`. Slug generated client-side via `crypto.getRandomValues` (16 chars from a 31-char base32-ish alphabet, ~80 bits).
- `src/pages/PublicShare.tsx` — public viewer; groups by year-month; projects recurring rules 6 months ahead; shows per-month totals.
- `src/pages/Settings.tsx` — `ShareLinkSection`: enable form, display-name editor, copy URL, disable button.
- `src/App.tsx` — top-level `<TopRoutes>` mounts `/share/:slug` outside Gate.

## Verification

- `npx tsc --noEmit` → clean (exit 0).
- `npm run lint` → 12 problems vs 13 baseline; the only delta is one fewer error (cleanup of dead conditional in lens code). All remaining warnings/errors are pre-existing React 19 strict-mode flags on existing useEffect patterns (MonthlyGoalCard, Ledger month-reset effects, etc.) — none introduced by this work.
- Manual smoke test pending — requires applying the migration first.

## Open follow-ups

- [ ] Apply migration `20260428_budg021_supersede_spaces_with_share.sql` to Supabase (via MCP `apply_migration` or Dashboard).
- [ ] After migration is applied, regenerate `src/lib/db.types.ts` from the live schema to replace the hand-patched copy.
- [ ] Manual smoke test (Phase 6 of [[BUDG-021 - Plan]]):
  1. Mark a transaction shared.
  2. Enable share in Settings; copy URL.
  3. Open URL in incognito → see entry under correct month with correct total.
  4. Toggle entry off → disappears on refresh.
  5. Disable share link → URL returns "Share not found".
- [ ] Consider: optionally regenerate-slug RPC (currently delete + re-enable cycles to a new slug).

## Anti-patterns avoided

- Did NOT edit accepted ADRs in place — wrote a new ADR-004 that supersedes them, per vault rule R6b.
- Did NOT reuse `space_id` as the public-share key (rejected in ADR-004 alternatives).
- Did NOT keep both BUDG-020 and BUDG-021 frontends side-by-side — clean cut.
