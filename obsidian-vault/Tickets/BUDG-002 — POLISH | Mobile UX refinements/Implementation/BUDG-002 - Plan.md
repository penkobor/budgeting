# BUDG-002 — Plan

**Ticket:** [[BUDG-002]] — Mobile UX refinements
**Type:** Implementation Plan

---

## Goal

Refine the mobile (iPhone PWA) experience based on first-use feedback: match iOS device curves, convert modals to bottom sheets, tighten spacing/typography, and clarify recurring-transaction terminology.

---

## Tasks

### ST1 — Bottom nav: concentric corner radius with iPhone 17 Pro Max screen
- [ ] Increase `rounded-3xl` (24 px) to `rounded-[44px]` on the floating nav pill so the outer curve visually matches the ~55 px device-screen radius
- [ ] Add slightly larger horizontal margin (`inset-x-3` → `inset-x-4`) so the curves look "concentric" rather than the pill cutting into the screen corner
- [ ] Tune bottom margin so the pill sits closer to the home indicator (`mb-[max(env(safe-area-inset-bottom),8px)]` → `mb-[max(env(safe-area-inset-bottom),6px)]`)
- [ ] Verify on iPhone 17 Pro Max PWA that pill radius visually nests inside screen radius

### ST2 — Modal → native iOS bottom sheet on mobile
- [ ] [src/components/ui/Modal.tsx](../../../../src/components/ui/Modal.tsx) — switch positioning per breakpoint
  - Desktop (`md:`): keep current centered dialog
  - Mobile: position at bottom (`fixed bottom-0 inset-x-0`), full width, only top corners rounded (`rounded-t-3xl rounded-b-none`), no `translate-y-1/2`
- [ ] Add **drag handle** (small grey pill at top: `<div className="mx-auto mt-2 mb-3 w-9 h-1 rounded-full bg-fg-subtle/40 md:hidden" />`)
- [ ] Replace `animate-slide-up` (8 px slide) with mobile-specific slide-from-bottom animation (`translate-y-full → 0`)
- [ ] Bottom safe-area: add `pb-[max(env(safe-area-inset-bottom),16px)]` to mobile sheet
- [ ] Tap-outside-to-dismiss already works via Radix Overlay — verify
- [ ] Defer: swipe-down-to-dismiss gesture (would need framer-motion `useDragControls`; skip unless trivial)

### ST3 — Compact mobile spacing & typography
- [ ] [src/pages/Dashboard.tsx](../../../../src/pages/Dashboard.tsx) — KPI cards: smaller padding on mobile (`p-4` → `p-3`), smaller stat numbers (`text-3xl` → `text-2xl md:text-3xl`)
- [ ] [src/pages/Ledger.tsx](../../../../src/pages/Ledger.tsx) — tighter row height, smaller font on day column, narrower gutter
- [ ] [src/pages/Recurring.tsx](../../../../src/pages/Recurring.tsx) — list rows tighter
- [ ] [src/pages/Categories.tsx](../../../../src/pages/Categories.tsx) — tile grid tighter on mobile
- [ ] [src/pages/Settings.tsx](../../../../src/pages/Settings.tsx) — section spacing tighter
- [ ] Page header (h1 / h2) on each page: `text-2xl md:text-3xl` consistently
- [ ] Reduce default container padding on mobile from `p-6` to `p-4`

### ST4 — Clarify "Generate" terminology
- [ ] Audit current copy: where does "Generate" appear?
  - Dashboard pending-recurring panel "Generate all" button
  - Ledger row "+ realise pending" link (uses different word, equally unclear)
- [ ] Rename to user-facing language. Recommended:
  - "Generate" → **"Add to ledger"** (verb that matches what actually happens — a real `transaction` row is created from the recurring rule projection)
  - "Realise pending" → **"Confirm"**
- [ ] Add inline helper text on Dashboard pending panel: _"These are upcoming recurring expenses we expect this month. Tap **Add to ledger** to record them once they actually happen."_
- [ ] Optional: add a small `(?)` info button in Recurring page that explains _"Recurring rules are templates. They appear in your forecast automatically, but only become real transactions when you confirm them in the Ledger."_

---

## Tests

- [ ] `npm run build` passes with no new warnings
- [ ] On iPhone 17 Pro Max PWA: bottom nav curve visually nests inside device curve (no awkward edges)
- [ ] On iPhone PWA: tapping FAB / Quick add opens a bottom sheet that slides up from screen bottom
- [ ] Dragging the sheet down OR tapping outside dismisses it
- [ ] Dashboard / Ledger / Settings all readable in one screen-height on iPhone 17 Pro Max in standalone mode
- [ ] No reference to "Generate" in user-facing copy after rename

---

## Non-goals

- Swipe-down-to-dismiss gesture on bottom sheets (defer to BUDG-003 if requested)
- Per-page custom mobile layouts (these polish items should be table-stakes, not redesigns)
- Dark/light theme tweaks — the existing theming works
- Adding `safe-area-inset-left/right` for landscape — phone-rotation use case is rare enough to defer

---

*Part of [[BUDG-002]]*
