# BUDG-022 - 2026-04-28 - phase4-recurring-overrides

*Part of [[BUDG-022]]*

## Session goal

Phase 4 from [[BUDG-022 - Plan]]: recurring-occurrence sources land via single-occurrence `recurring_overrides` rows instead of mutating the rule.

## What landed

### SharedLens

- `useRecurringOverridesInRange` is now consumed by the lens. The displayed amount of a recurring row is `effectiveOccurrenceAmount(rule, date, overrides)` — i.e. it reflects any prior trims/skips, so subsequent drags act on the current effective value, not the rule's nominal one.
- Skipped occurrences (`eff === null`) are filtered out of the lens entirely, matching the rest of the app's projection semantics.
- Recurring rows that have an `amount_override` get a small "adjusted" pill next to the existing "recurring" pill, so users can spot which occurrences they've already nudged.

### Drag/drop generalisation

- New helpers `deltaPayload(entry, newAmount)` and `mergePayload(a, b)`. They turn "set this row's amount to X" into the right slice of `RedistributePayload`:
  - tx → `tx_updates: [{ id, amount: newAmount }]`
  - recurring → `override_upserts: [{ rule_id, occurrence_date, amount_override: |newAmount|, skipped: |newAmount| === 0 }]`
- Drag onto row composes `mergePayload(deltaPayload(src, srcNew), deltaPayload(dst, dstNew))`.
- Drag onto drop zone composes `{ ...deltaPayload(src, srcNew), tx_inserts: [{ ... }] }`.
- This unifies all four flow combinations (tx⇄tx, tx⇄recurring, recurring⇄tx, recurring⇄recurring) and the create-new flow into a single readable code path.

### Drag chip is now always draggable

- Removed the early-return in `onDragStart` that blocked recurring sources with a toast. `onDragStart` now just sets `dragSrc` for every entry kind.

## Behaviour matrix (full)

| Source / Target | Drop on row (same kind) | Drop on `+ new event` zone |
| --- | --- | --- |
| tx → tx | `tx_updates [src ∓ n, dst ± n]` | `tx_updates [src ∓ n] + tx_inserts [{…}]` |
| tx → recurring | `tx_updates [src ∓ n] + override_upserts [{dst.rule, dst.date, |dst.amount + sign·n|}]` | n/a — handled above |
| recurring → tx | `override_upserts [{src.rule, src.date, |src.amount − sign·n|}] + tx_updates [{dst, dst ± n}]` | `override_upserts […] + tx_inserts […]` |
| recurring → recurring | both override_upserts | both override_upserts + tx_inserts (zone case) |
| Pull full amount off recurring | `amount_override: null + skipped: true` (row disappears) | same; new tx is inserted |

`amount_override` always stores the **magnitude** (positive number) — sign is derived from `rule.kind` by `effectiveOccurrenceAmount`. The lens enforces this by using `Math.abs(newAmount)` in `deltaPayload`.

## Open question — recurring → recurring across rules

For now, transferring between two recurring occurrences with different rules works mathematically (both get override rows). UX-wise it might surprise the user because it's "untying" the rules' nominal amounts for that single occurrence on both sides. Acceptable per Plan §Open questions ("always single occurrence"), but worth a follow-up note if multiple users complain.

## Build / lint state

- `npm run build` passes (vite + tsc -b).
- No new lint errors.

## Manual smoke (to do)

1. Create a shared recurring rule with monthly amount 1 000.
2. Open Shared lens → see the next 6 occurrences.
3. Drag chip from one occurrence onto a sibling shared tx in the same month → release after 300.
   - That recurring occurrence shows 700 with "adjusted" pill.
   - Sibling tx amount increased by 300.
4. Drag the same recurring occurrence's chip again onto another row, peel another 300 → recurring shows 400.
5. Drag the chip until 0 → row disappears (skipped).
6. Reload `/share/:slug` → recurring rule now produces 700 (or vanishes) for that month, the way the lens shows it.

## Next session

- Phase 6: standalone "+ Add shared event" without a source — opens a similar modal but seeds `amount=0` and requires the user to type one. Source side stays empty (no `tx_updates` / `override_upserts`).
- Phase 5: long-press / bottom-sheet fallback for mobile. Will reuse the same `redistribute_shared` plumbing — just a different gesture surface.
- Phase 7: optimistic updates and visual diff highlighting.
