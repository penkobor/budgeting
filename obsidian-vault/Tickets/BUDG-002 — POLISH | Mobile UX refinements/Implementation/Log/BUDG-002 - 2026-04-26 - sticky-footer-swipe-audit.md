---
ticket: BUDG-002
date: 2026-04-26
session: sticky-footer-swipe-audit
---

*Part of [[BUDG-002]]*

# BUDG-002 — Sticky footer, swipe-to-dismiss, mobile audit

## Scope (ST5–ST7)
Last three steps of the BUDG-002 plan, bundled in a single iteration so the
audit could verify them in-browser before commit.

## ST5 — Sticky footer integration
- `AddTransactionDialog`, `RuleForm` (Recurring), `CategoryForm` (Categories)
  now pass their action buttons through the new `Modal` `footer` prop.
- Submit buttons live **outside** the `<form>` and link via the standard HTML
  `form="<id>"` attribute. Each form got an `id`:
  - `AddTransactionDialog` → `id="add-tx-form"`
  - `RuleForm` → `id="rule-form"`
  - `CategoryForm` → `id="category-form"`
- On mobile this puts Cancel/Save in a sticky bottom bar that respects
  `env(safe-area-inset-bottom)`; on desktop it sits at the bottom of the
  glass dialog as before.

## ST6 — Swipe-down-to-dismiss
- Wrapped the `Dialog.Content` body in a `motion.div` with `useDragControls`.
- Drag is enabled only when `window.matchMedia('(max-width: 767px)').matches`
  — desktop dialog stays static.
- Drag listener is started by the **header strip** via
  `onPointerDown={(e) => dragControls.start(e)}` (so users grab the handle,
  not random form fields). The Close `X` button calls
  `e.stopPropagation()` so tapping it never starts a drag.
- Dismiss thresholds: `info.offset.y > 120 || info.velocity.y > 600` →
  `onOpenChange(false)`.
- `dragConstraints={{ top: 0, bottom: 0 }}` + `dragElastic={{ top: 0,
  bottom: 0.6 }}` — sheet rubber-bands when pulled past resting position
  but cannot be pushed up.

## ST7 — Audit + fixes
Opened `http://localhost:5174/` in the VS Code integrated Playwright browser
(viewport ~417×995, dark mode), signed in as the seeded user, and went
through every page. Findings + fixes:

### Glitch: lone em-dash in Ledger day stack
On mobile each ledger row stacked vertically (5-col grid → 5 rows). The
income / spending summary columns rendered `—` placeholder when zero, which
showed up as a stray em-dash row beneath each day's transactions.

**Fix:** wrapped both summary cells in `hidden md:block` — desktop still gets
the right-aligned Income/Spending columns, mobile relies on the inline
amount next to each transaction row.

### Glitch: transactions without description rendered as `—`
`Dashboard` `UpcomingList` and `Ledger` per-row title both used
`description ?? '—'` which produced naked em-dashes in the lists.

**Fix:** new fallback chain `description?.trim() || catMap[category_id].name
|| 'Untitled'`. Pulled `useCategories()` into Dashboard, built `catMap`,
extracted a `txLabel(t)` helper. Ledger already had `catMap` so the inline
expression was enough.

### Glitch: Settings → Opening balance squeezed inputs
Three-column flex (Month | Balance | Save) was unreadable at ~407px wide:
the Balance input cropped to 4 chars.

**Fix:** switched to `grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 md:items-end`.
Stacks on mobile, single row on desktop.

### Polish: hide kbd hint on mobile sheet
`AddTransactionDialog` passes `description="Press ⌘+Enter to save"`, which
showed inside the mobile sheet header — meaningless on touch. Removed the
mobile-side render of `<Dialog.Description>` from `Modal.tsx`; desktop still
shows it under the title.

## Verification
- `npx tsc -b` ✅
- `npm run build` ✅ (production bundle)
- Visual sweep through Dashboard / Ledger / Recurring / Categories /
  Settings at iPhone-width viewport. Bottom nav pill, FAB, sticky footer,
  drag-handle all behave.

## Commit
`7c682f5` — BUDG-002 ST5+ST6+ST7: sticky-footer, swipe-to-dismiss, audit fixes.

## Follow-ups (out of BUDG-002)
- Several seeded transactions show as `planned italic` because the import
  flagged them with `planned=true`. Either the seed should clear the flag
  or the user can mark them confirmed via the row check button. Not a UI bug.
- Could test desktop (md+) layout once the integrated browser supports
  larger viewports — VS Code currently caps the embedded webview at ~417 px
  wide regardless of `page.setViewportSize`. Production deploy on a real
  desktop browser still works (verified in earlier sessions).
