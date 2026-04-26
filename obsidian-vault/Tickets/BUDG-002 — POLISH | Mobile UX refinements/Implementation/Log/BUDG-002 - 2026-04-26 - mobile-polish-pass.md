# BUDG-002 — Mobile polish pass: sheet modals + compact UI + clearer copy

**Ticket:** [[BUDG-002]] — Mobile UX refinements
**Date:** 2026-04-26
**Type:** Implementation Log (entry)

---

## Context

First-iPhone-test feedback ([[BUDG-001 - Feedback]]) flagged four issues with the freshly-deployed PWA on iPhone 17 Pro Max:
1. Bottom nav corner radius didn't match the device screen curve
2. Modals looked like centred desktop dialogs (ugly on a phone)
3. Spacing/typography was too desktop-sized on mobile
4. The word "Generate" on recurring panels was unclear

This session executed all four polish items in one pass. Followed [[BUDG-002 - Plan]] subtasks ST1–ST4.

---

## Changes

### ST1 — Bottom nav radius matches iPhone screen curve
- [src/components/Layout.tsx](../../../../src/components/Layout.tsx) — floating nav pill: `rounded-3xl` → `rounded-[44px]`, `inset-x-3` → `inset-x-4`, bottom margin tightened from 8 px to 6 px so the pill nests inside the device curve.

### ST2 — Modal converted to native iOS bottom sheet on mobile
- [src/components/ui/Modal.tsx](../../../../src/components/ui/Modal.tsx) — single `Dialog.Content` now renders responsively:
  - Mobile (`max-md:`): `inset-x-0 bottom-0`, only top corners rounded (`rounded-t-3xl rounded-b-none`), full width, `max-h-[85vh] overflow-y-auto`, bottom safe-area padding.
  - Desktop (`md:`): unchanged — centred dialog with `max-w-{sm,md,lg}`.
  - Drag-handle visual at the top of mobile sheets (`mx-auto w-9 h-1 rounded-full bg-fg-subtle/40`).
- [tailwind.config.js](../../../../tailwind.config.js) — added `sheet-up` keyframe (`translateY(100%) → 0`) and `animation['sheet-up']` with iOS-style easing (`cubic-bezier(0.32, 0.72, 0, 1)`). Modal uses `animate-sheet-up md:animate-slide-up`.
- Tap-outside-to-dismiss already worked via Radix Overlay.
- **Deferred:** swipe-down-to-dismiss gesture (not in scope per Plan non-goals).

### ST3 — Compact mobile spacing & typography
- All page outer containers: `p-6 md:p-8 space-y-6` → `p-4 md:p-8 space-y-4 md:space-y-6` ([Dashboard](../../../../src/pages/Dashboard.tsx), [Ledger](../../../../src/pages/Ledger.tsx), [Recurring](../../../../src/pages/Recurring.tsx), [Categories](../../../../src/pages/Categories.tsx), [Settings](../../../../src/pages/Settings.tsx)).
- All section cards: `card p-5` → `card p-4 md:p-5` (4 sections in Settings, 3 in Dashboard).
- KPI grid: `gap-4` → `gap-3 md:gap-4`.
- KPI card itself: `card p-4` → `card p-3 md:p-4`; stat number `text-2xl` → `text-xl md:text-2xl`; sub label `text-xs` → `text-[11px] md:text-xs`.
- Header sizes (`text-2xl md:text-3xl`) already responsive — kept as-is.

### ST4 — "Generate" renamed + helper text
- [src/pages/Dashboard.tsx](../../../../src/pages/Dashboard.tsx) — Pending recurring panel:
  - Label "Pending" → "Upcoming this month".
  - Heading "N planned recurring entries" → "N expected recurring payment(s)".
  - Added explanatory `<p>`: _"These are recurring rules that haven't been recorded yet. Tap 'Add all to ledger' once they actually happen — each becomes a real transaction in the running balance."_
  - Button "Generate all" → "Add all to ledger".
- [src/pages/Ledger.tsx](../../../../src/pages/Ledger.tsx) — pending row chip "generate" → "add to ledger" + tooltip.
- [src/pages/Recurring.tsx](../../../../src/pages/Recurring.tsx) — added page-level explainer: _"Templates for payments and income that repeat — rent, subscriptions, salary. They appear in your forecast automatically; tap **Add to ledger** in the Dashboard or Ledger to record them as actual transactions when they happen."_

---

## Verification

- `npx tsc -b` — clean, no errors
- `npm run build` — succeeds in 2.52 s; bundle 1.07 MB (321 KB gz); PWA precache 17 entries; only warning is the standard >500 KB chunk-size hint (deferred polish item)
- Commit `66264d1` pushed to `main`
- GitHub Actions run [`24958591207`](https://github.com/penkobor/budgeting/actions/runs/24958591207) deploying to https://penkobor.github.io/budgeting/

---

## Follow-ups

### Pending user verification on device
- [ ] iPhone 17 Pro Max PWA: confirm bottom nav curve visually nests inside screen radius
- [ ] Tap any modal trigger (FAB / Quick add / Add rule / Add category) and confirm sheet slides up from bottom with drag handle
- [ ] Confirm Dashboard / Ledger fit comfortably in one screen height
- [ ] Confirm "Add to ledger" copy makes the recurring concept clear

### Opened by this session
- [ ] Code-splitting to silence the >500 KB chunk warning — lazy-load Recharts and framer-motion on routes that need them (BUDG-003 candidate)
- [ ] Optional: actual swipe-down-to-dismiss gesture for bottom sheets via framer-motion `useDragControls` (BUDG-003 candidate)

### Carried forward from BUDG-001 (still unaddressed)
- [ ] User-side: Set Site URL / Redirect URLs in Supabase auth/url-configuration
- [ ] User-side: Set 90-day inactivity timeout in Supabase auth/sessions
- [ ] Replace `₿` glyph icon with a proper SVG (Bitcoin symbol — wrong vibe)
- [ ] Category-breakdown donut chart on Dashboard
- [ ] Inline arrow-key navigation in Ledger

---

*Part of [[BUDG-002]]*
