# BUDG-022 - 2026-04-28 - phase3-cross-month-and-dropzones

*Part of [[BUDG-022]]*

## Session goal

Phase 3 from [[BUDG-022 - Plan]]: cross-month tx-to-tx redistribute + drop-on-empty-zone that creates a new shared event in the destination month.

## What landed

- Removed the same-month constraint from `isValidPair` in [src/pages/lenses/SharedLens.tsx](src/pages/lenses/SharedLens.tsx). Cross-month transfers now go through the same `redistribute_shared` RPC with two `tx_updates`.
- Each month section now carries a dashed-border drop tile with `data-share-dropzone={ym}`. The pointer-resolution logic in `onDrag` accepts both `[data-share-row]` and `[data-share-dropzone]` and tags drop-zone targets with the prefix `dropzone:` in `dragTargetKey`.
- Always render at least one *future-month* tile after the last visible month so the user can drop onto a not-yet-populated month. If the bag is empty entirely, a single tile for the current month is shown.
- New `CreateFromDropModal` component, opened on `dragEnd` whose target is a drop zone:
  - Slider for the transfer amount (max = `|src.amount|`).
  - Date picker (default = first of destination month, or today if that's earlier).
  - Description text input (default = source row's label).
  - Confirm calls `redistribute_shared` with both a `tx_updates` (decrement source) and a `tx_inserts` (new event with sign matching source kind, `is_shared = true` enforced server-side).
  - Cancel discards. The drag itself is already over by the time the modal appears, so source rows aren't visually stuck.

## Behaviour matrix

| Source | Drop on row (any month, same kind) | Drop on `+ new event` zone |
| --- | --- | --- |
| `tx` (this phase) | Slider on release → atomic `tx_updates [src ∓ n, dst ± n]` | Modal asks for date+desc → `tx_updates [src ∓ n] + tx_inserts [{… is_shared: true}]` |
| `recurring` | Phase 4 — currently shows toast on drag start | Phase 4 — modal could open but disabled at drag start |
| `tx` cross-kind (income↔expense) | Red highlight; ignored on release | Allowed — kept guarded only between rows for now |

## Build / lint state

- `npm run build` passes (vite + tsc -b).
- No new lint errors.

## Decisions

- Drop tile is always visible (not gated by `dragSrc != null`) so users can discover the cross-month flow without first picking up a chip. Style is muted when idle, becomes accent-blue when hovered with a chip.
- Default `occurred_on` clamps to today: if a user drops onto, say, "current month" zone but today is the 20th, we don't seed a planned tx in the past on the 1st.
- Description default = source label. User can clear it freely. Categories left out of the modal — categories on quick-add were declared optional in Plan §Open questions.
- Empty bag still shows one current-month tile so the very first redistribute can be a "peel off into a new event" flow even before any other shared row exists. (Realistically: user normally has at least one shared row first since the feature only exists for owners with shared events; but guarding makes the lens never feel dead.)

## Manual smoke (to do)

1. **Cross-month**: shared expense in May + shared expense in July → drag chip from May onto July row → release at slider 25% → both update in their months, `/share/:slug` reflects.
2. **Drop on empty tile in current month**: drag chip onto "+ new shared event" tile of the source's own month → modal opens → set amount, date, description → confirm → new tx appears in lens; source decremented.
3. **Drop on empty tile in future month**: same as 2 but date defaults to first of that month.
4. **Cancel modal**: open the modal, hit Cancel → no-op, drag state cleared, no toast, no DB write.

## Next session

- Phase 4: recurring-occurrence sources — emit `override_upserts` instead of `tx_updates`. Slider max = the rule's effective amount for that occurrence (already read by current `Entry.amount`).
- Phase 6: standalone "+ Add shared event" button per month (no source). Uses the same modal with "amount" mandatory and no source decrement.
- Phase 5: long-press + bottom sheet for mobile.
