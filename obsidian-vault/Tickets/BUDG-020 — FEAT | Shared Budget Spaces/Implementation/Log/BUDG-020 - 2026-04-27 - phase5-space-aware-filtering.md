# BUDG-020 — 2026-04-27 — Phase 5 space-aware filtering

*Part of [[BUDG-020]]*

## What
Threaded `currentSpaceId` (from `useUi`) through all data-aware screens so the entire app honours the Personal vs Joint context. Also added `get_space_member_profiles` RPC so member rows can show real emails instead of truncated user_ids.

## Profile-name resolution (preceded Phase 5)
- Migration: `supabase/migrations/20260427_budg020_get_space_member_profiles.sql` — SECURITY DEFINER RPC returning `(user_id, email)` for members of a space, with caller-membership check inside the body.
- Hook: `useSpaceMemberProfiles(spaceId)` in `src/hooks/spaces.ts`.
- Updated `src/pages/SpaceDetail.tsx` to display "You" + email under name; emails as primary names for partners.

## Phase 5 — query contract (delegated, completed in two subagent runs)

### `src/hooks/queries.ts` — new contract
- `useTransactionsInRange(from, to, opts?)` — opts is `{ spaceId?: string | null, includeOwnShared?: boolean }`.
  - No opts (legacy): own personal only (`space_id IS NULL`).
  - `{ spaceId: '<uuid>' }`: shared tx of that space (any member, via RLS).
  - `{ includeOwnShared: true }`: own personal + own shared. Used by personal Ledger.
- `useRecurringRules(opts?)` — same `{ spaceId }` shape; default = personal only.
- New `useAllSpaceCategoriesForMe()` — used by Ledger for badge colouring of own-shared rows in Personal context.
- `useMonthlyOpening` queries hardened with `.is('space_id', null)` so personal projections never accidentally include shared rows.

### Lenses
- `TodayLens`, `WeekLens`, `MonthLens` — pass `{ spaceId: currentSpaceId }` when in Joint; in Joint use `space_categories` and zero personal anchors (`opening = 0`, `assetBoost = 0`).
- `MonthLens` Joint hero — compact "Planned · Income · Net" tile replacing the personal `MonthlyGoalCard`.
- `ForecastLens`, `PlanLens` — render a small "switch back to Personal" placeholder in Joint (they depend on personal-only anchors `monthly_openings` and the personal commit pipeline).

### Ledger (`src/pages/Ledger.tsx`)
- **Personal context**: `useTransactionsInRange(from, to, { includeOwnShared: true })`. Shared rows get a clickable Space chip (Кафе · Joint:Аня) coloured with the `space_categories` colour; clicking the chip calls `setCurrentSpaceId(space_id)`.
- **Joint context**: `{ spaceId: currentSpaceId }`. Rows show an author-initial chip (from `useSpaceMemberProfiles`); category column uses `space_categories`. Opening is 0 in Joint.

### Recurring (`src/pages/Recurring.tsx`)
- Scoped to `currentSpaceId`. Subtitle reflects context. Rule form swaps category select to `space_categories` in Joint and writes `(space_id, space_category_id)` together to satisfy the CHECK constraint.

### AddTransactionDialog
- Joint context: title "Add to {space.name}", category select uses `useSpaceCategories(currentSpaceId)`, submit writes `(space_id, space_category_id)`. Rebalance step is skipped (joint spend doesn't trigger personal goal logic).
- Personal context: optional "Make this shared" toggle that appears only if the user has ≥1 space. When ON, a space-picker (chips) and `space_categories` for that space replace the personal category list. Mutually-exclusive form state enforces the CHECK constraint.

### GoalAlertRibbon
- Returns null when `currentSpaceId !== null`. Goal feature is strictly personal.

## Validation
- `npx tsc -p tsconfig.app.json --noEmit` → clean.
- `npx vitest run` → 15/15 pass (projection.test.ts 11, projection-lens.test.ts 4). Existing tests unchanged.

## Phase-6 follow-ups (parking lot)
- MonthLens Joint "Projected end" KPI is currently zero-anchored — decide whether to remove or re-anchor to a joint opening concept.
- Forecast / Plan tabs could be hidden entirely from the lens switcher in Joint, instead of showing placeholders.
- "Make this shared" toggle in Add Transaction could remember the last-picked `spaceId` across opens.
- Joint Ledger pending recurring rows currently show no author chip (rules don't carry per-occurrence author); could fetch rule author email lazily.
- Toggling off "shared" in AddTransactionDialog while a `space_category_id` was set leaves category empty — could remember last personal selection.
- Recurring rule create in Joint: space_categories have no `kind` column, so all categories show in both expense and income segments. If kind-distinction is desired in Joint, add `kind` to `space_categories` (schema change).

## Known caveats
- Personal Ledger running-balance now includes own-shared txs alongside own-personal (because `{ includeOwnShared: true }`). The `monthly_opening` anchor is still personal-only, so the running balance has a slight overcount when the user has many own-shared txs early in the month. Likely fine for visual purposes; worth measuring before fixing.
- Subagent took two runs to complete Phase 5 (first run hit context limit after queries.ts + TodayLens + GoalAlertRibbon); the second run was given the established contract and finished cleanly.

## Next session
- Phase 6: polish (badges visual refinement, quick-add context-aware copy adjustments, follow-ups above).
- Phase 7: tests (RLS test for cross-user shared visibility, E2E happy path) + docs.
- Manual end-to-end test in dev: create a space, generate invite, accept on a second account, add shared tx, verify both sides see the right things.
- Decide on commit/branch strategy — whole BUDG-020 is in working tree on `main` right now.
