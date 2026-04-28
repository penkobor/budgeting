# BUDG-022 - ADR-002 - Drag-and-drop slider as primary UX

*Part of [[BUDG-022]]*

## Status

Accepted — 2026-04-28

## Context

User wants the redistribute interaction to feel "like a slider" — drag value from one row to another. Considered patterns:

1. Modal "Redistribute": pick source/target rows + amount in a number input.
2. Pairs of bidirectional +/− steppers next to each row.
3. Mint/YNAB lock-icon sliders on each row (set new amount, others auto-rebalance).
4. **Drag-and-drop money chip from row to row.**

## Decision

Primary UX = **drag-and-drop money chip**. Each shared row carries a draggable amount chip on the right edge. Dragging the chip onto another shared row opens a **floating slider thumb** that scrubs how much to transfer (0 → full source amount). Releasing commits the transfer atomically.

Fallback for keyboard / touch users where DnD is awkward: **long-press (or "..." menu) → "Redistribute → pick target → slider in a sheet"**. Same domain action, same RPC underneath.

## Consequences

- **Pro** — direct manipulation matches the user's mental model ("сдвинуть сумму отсюда сюда").
- **Pro** — slider gives a built-in upper bound (can't transfer more than source has), preventing negative balances.
- **Con** — DnD is non-trivial on mobile (which is the primary form factor for this PWA). Mitigated by the long-press fallback that opens an identical-looking bottom sheet.
- **Con** — needs `framer-motion`'s drag (already a dep) plus pointer-event handling in lists. Manageable.
- **Decision contingent on BUDG-022 - ADR-003** for *what gets persisted* — only the UI is decided here.

## Alternatives considered

- **Modal-only** — fast to ship, but feels enterprise-y and adds dialog fatigue. Reserved as fallback.
- **Per-row +/− steppers** — discoverable but verbose; user has to figure out where the offsetting amount goes.
- **Mint-style global slider with locks** — over-engineered for a typical 5-15 shared rows; locks UX is famously confusing.
