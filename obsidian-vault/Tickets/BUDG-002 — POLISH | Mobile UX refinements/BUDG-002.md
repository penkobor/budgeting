# BUDG-002 — POLISH | Mobile UX refinements

**Repo:** [penkobor/budgeting](https://github.com/penkobor/budgeting)
**Live:** https://penkobor.github.io/budgeting/
**Status:** Done
**Started:** 2026-04-26
**Completed:** 2026-04-26
**Source:** [[BUDG-001 - Feedback]] (raw user feedback after first iPhone test)

---

## Summary

Polish pass on the mobile experience after the user installed the PWA on iPhone 17 Pro Max. Four discrete improvements: (1) bottom nav corner radius should be **concentric** with the device screen curve, (2) modals look like desktop dialogs centred on screen — should be native iOS bottom sheets, (3) overall spacing and typography are too desktop-sized on mobile, (4) the word "Generate" on recurring panels is unclear — rename and explain.

---

## Notes

### Analysis
- _none yet_

### Implementation
- [[BUDG-002 - Plan]] — broken-down subtasks for each feedback item

### Implementation Log
- [[BUDG-002 - 2026-04-26 - sticky-footer-swipe-audit]] — ST5/ST6/ST7: sticky footer wired, swipe-to-dismiss gesture, browser audit + fixes (em-dash placeholders, Settings input squashing, mobile kbd hint)
- [[BUDG-002 - 2026-04-26 - modal-sheet-rework]] — full rewrite of Modal as native iOS bottom sheet (sticky header + body + footer, 16px inputs)
- [[BUDG-002 - 2026-04-26 - mobile-polish-pass]] — all four ST1–ST4 subtasks shipped in one session

### QA
- _none yet_

### API
- _none yet_

### Prompts
- _none yet — driven directly from [[BUDG-001 - Feedback]]_

### ADRs
- _none yet — may add ADR-001 if bottom-sheet implementation needs a non-obvious choice (gestures, library, etc.)_

---

*Part of [[00 Vault Index]]*
