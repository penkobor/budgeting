# BUDG-002 — Modal: full rework as native iOS bottom sheet

**Ticket:** [[BUDG-002]] — Mobile UX refinements
**Date:** 2026-04-26
**Type:** Implementation Log (entry)

---

## Context

After the [[BUDG-002 - 2026-04-26 - mobile-polish-pass]] shipped, the user tested on iPhone 17 Pro Max PWA and reported the modal sheets still looked bad. Re-investigation found three real problems with the first implementation:

1. **`.glass` wrapper had a full all-around border + shadow** — looks correct on a centred desktop dialog, but on a bottom sheet the bottom edge is offscreen and the side borders + bottom shadow were either invisible or wrong, making the sheet feel like "a desktop modal stuck to the bottom".
2. **Inputs at `text-sm` (14 px)** — iOS Safari auto-zooms the viewport when a focused input has font-size < 16 px. On a PWA this is jarring.
3. **No sticky header / footer** — title scrolled with content; submit button was buried at the bottom of the form, easily hidden behind the iOS keyboard with no visual hint to scroll.

Discussed alternatives with user (full-screen push modal vs bottom sheet vs action sheet). Decided on **bottom sheet with sticky header + scrollable body + sticky footer** — the iOS Settings / Apple Wallet pattern, which matches our use case (compact forms with one primary CTA).

---

## Changes

### Modal rewrite — [src/components/ui/Modal.tsx](../../../../src/components/ui/Modal.tsx)
Single component, dual presentation via Tailwind `max-md:` / `md:` variants on one DOM tree:

- **Mobile structure** = three vertical regions inside `Dialog.Content`:
  1. Sticky header — drag handle + centered title + 40×40 px close button. Backdrop-blurred `bg-bg-card/95`, top-only rounded.
  2. Scrollable body with `flex-1 overflow-y-auto` and `-webkit-overflow-scrolling: touch`.
  3. Sticky footer (when `footer` prop is provided) — backdrop-blurred, border-top, `pb-[max(env(safe-area-inset-bottom),12px)]` so primary action stays above the home indicator and is never hidden by the keyboard.
  - When no footer: a phantom `h-[max(env(safe-area-inset-bottom),12px)]` div at the bottom for safe-area padding.
- **Mobile container styling**: dropped `.glass`, used opaque `bg-bg-card` with shadow ABOVE the sheet (`shadow-[0_-12px_40px_-8px_rgba(0,0,0,0.5)]`). No side or bottom borders. `rounded-t-3xl rounded-b-none`. `max-h-[88vh]` so user can swipe down on the visible top edge / overlay area to dismiss.
- **Desktop unchanged**: still glass surface, centred, `md:max-w-{sm,md,lg}`.

### Input + button — [src/index.css](../../../../src/index.css)
- `.input` font-size: `text-sm` → `text-base md:text-sm` (16 px on mobile prevents iOS auto-zoom; 14 px on desktop preserves density).
- `.input` and `.btn` vertical padding: `py-2` → `py-2.5 md:py-2` (44 px touch target on mobile per Apple HIG, denser on desktop).

### Not yet done (deferred to a follow-up if needed)
- Convert `AddTransactionDialog`, `RuleForm`, `CategoryForm` submit buttons to use the new sticky-footer slot (currently buttons live inside the `<form>` body, so they scroll with content). Would be cleaner UX but requires touching 3 files. Acceptable for now since the sheet itself is now properly scrollable.
- Real swipe-down-to-dismiss gesture (still in non-goals).

---

## Verification

- `npx tsc -b` — clean
- `npm run build` — succeeds; bundle 1.07 MB (322 KB gz), CSS 33 KB (gz 6.5 KB)
- Commit `ef28e6b` pushed to `main`
- Deployed via existing GitHub Actions pipeline

---

## Follow-ups

- [ ] User-side: verify on iPhone PWA — the sheet should now feel native (handle visible, title sticky, content scrolls smoothly, no auto-zoom on input focus, primary action above keyboard)
- [ ] If forms still feel cramped: refactor `AddTransactionDialog` etc. to put their submit button in the Modal `footer` prop (sticky-footer pattern), removing it from the form body
- [ ] Consider adding `prefers-reduced-motion` to disable the `sheet-up` animation for users who set it
- [ ] If swipe-down-to-dismiss is wanted: spike with `framer-motion`'s `useDragControls` on the header drag-handle area only

---

*Part of [[BUDG-002]]*
