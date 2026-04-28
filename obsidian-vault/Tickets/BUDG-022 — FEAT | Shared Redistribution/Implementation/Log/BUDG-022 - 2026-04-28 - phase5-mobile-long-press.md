# BUDG-022 - 2026-04-28 - phase5-mobile-long-press

*Part of [[BUDG-022]]*

## Session goal

Phase 5 from [[BUDG-022 - Plan]]: provide a non-drag fallback for touch devices where DnD competes with native vertical scroll, and where drag chips can be hard to grab with a thumb.

## What landed

### Long-press → picker mode

Long-press detection added inside `DragChip` via raw pointer events (independent of framer-motion drag, since framer's drag only engages after movement):

- `onPointerDown` records origin and starts a 500 ms timer.
- `onPointerMove` cancels the timer if the pointer moves more than 6 px (squared) from origin → drag attempt wins.
- `onPointerUp` / `onPointerCancel` / `onPointerLeave` clear the timer.
- If the timer fires uninterrupted, `onLongPress()` is called → SharedLens enters picker mode.
- Once the timer fired, the next `onDragStart` (if any) is suppressed via a ref flag.
- `disableDrag` prop on `DragChip` flips `drag={'x' | false}` while picker mode is active so the chip stops being a drag handle.

### Picker mode UI

When `pickerSrc` is set:

- Source row chip shows a subtle source highlight.
- Valid target rows: `bg-accent/5 ring-1 ring-inset ring-accent/40 cursor-pointer`. Tap → opens `TransferToRowModal`.
- Invalid target rows: `opacity-40` (no pointer-events removed since the click is conditional on `pickerValid`).
- Drop zones: gain `border-accent/60 cursor-pointer hover:bg-accent/10` and "Tap to create a new shared event here" copy. Tap → reuses the existing `CreateFromDropModal` via `setCreateDraft({...})`.
- Sticky bottom bar (`fixed bottom-0 inset-x-0 z-40`) shows source label + amount and a Cancel button.

### `TransferToRowModal` (new)

Used only by picker mode, since drag mode already has the in-place slider. The modal is a focused two-step UX for thumbs:

- A range slider for the transfer amount (default = `max / 2`, so the user can fine-tune in either direction).
- Two preview tiles showing src-after and dst-after, refreshed live as the slider moves.
- Confirm button labelled "Move {amount}". On confirm, calls `redistribute_shared` with `mergePayload(deltaPayload(src, srcNew), deltaPayload(dst, dstNew))` — i.e. the same payload-assembly helpers as drag mode.

### Header copy

Added "On touch devices long-press a chip then tap a target." to the help line under the header.

## Why long-press, not tap

A plain tap collides with the chip just being readable text — users would tap it to select / read amounts. Long-press is intentional, matches platform conventions for "context menu / pick up", and the 500 ms threshold gives plenty of time to abort by moving the finger.

## Build / lint state

- `npm run build` (vite + tsc -b) green.
- Bundle grew +2.6 KiB (mostly the new modal + picker bar markup).

## Manual smoke (to do, on phone or DevTools mobile mode)

1. Open Shared lens on touch device.
2. Long-press a chip — picker bar appears.
3. Valid target rows show accent ring; invalid ones dim out.
4. Tap a row → modal with slider opens.
5. Drag slider → preview tiles update.
6. Confirm → toast, modal closes, picker mode exits, lens refreshes.
7. Repeat with a drop zone tap → `CreateFromDropModal` opens.
8. Cancel from bottom bar → exits picker mode without changes.

Edge cases:
- Long-press a chip, then start moving (drag) — drag should win, no picker mode.
- Long-press, then tap source chip again — nothing happens (drag is disabled, no extra picker handler).

## Next session

- Phase 7: optimistic updates (`onMutate` populates the queries with the projected amounts so the UI reacts in the same frame as the request) and a brief diff-highlight pulse on the rows that were affected.
