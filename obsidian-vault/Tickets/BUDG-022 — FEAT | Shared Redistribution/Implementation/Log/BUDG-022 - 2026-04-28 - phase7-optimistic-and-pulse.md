# BUDG-022 - 2026-04-28 - phase7-optimistic-and-pulse

*Part of [[BUDG-022]]*

## Session goal

Phase 7 from [[BUDG-022 - Plan]]: make redistribute feel instant and self-explanatory.

## What landed

### Optimistic cache patching in `useRedistributeShared`

`onMutate` now patches every cached `transactions` and `recurring_overrides` query before the RPC round-trip:

- `cancelQueries` first to avoid a race between in-flight refetch and the optimistic mutation.
- Snapshot all `['transactions', from, to]` and `['recurring_overrides', from, to]` query data via `qc.getQueriesData(...)`. Snapshots travel back as the mutation context.
- For each cached transactions list: apply `tx_updates` by id and append `tx_inserts` whose `occurred_on` falls in that query's `[from, to]` window. Inserted rows get a synthetic `__optimistic_<rand>` id with `is_shared: true` so they are visible everywhere immediately (Ledger, lenses, SharedLens).
- For each cached overrides list: upsert by `(rule_id, occurrence_date)`. New ones are appended with synthetic ids.
- `onError` rolls back from the snapshot.
- `onSettled` invalidates so the synthetic rows get replaced by real ones.

This affects not only SharedLens but also Ledger / TodayLens / WeekLens / MonthLens / ForecastLens — they all consume `['transactions', …]` queries and will see the redistribute take effect in the same frame.

### Diff-highlight pulse

SharedLens now derives the affected entry keys from each payload before sending it:

- `tx:<id>` for each `tx_updates` row.
- `r:<rule_id>:<occurrence_date>` for each `override_upserts` row.

`tx_inserts` are not pulsed (they don't have an existing key — their entrance is already obvious because they appear out of nowhere).

`recentlyChanged` is a `Set<string>` cleared after 1.5s. Rows whose key is in the set get `bg-accent/20 animate-pulse`. The pulse is inserted into the same className composition as picker / drag highlights, so they coexist.

`pulseKeys(...)` is called from all three confirm paths:

- drag → row `onDragEnd`
- picker mode tap → `TransferToRowModal.onConfirm`
- drag/picker → drop zone (`CreateFromDropModal.onConfirm`)

## What was deliberately NOT done

- **Coalesce redundant `cancelQueries` / `invalidateQueries`** across the three keys — they're cheap and TanStack handles duplicates fine.
- **Pulse on tx_inserts** — would require tracking the synthetic id through invalidation. Not worth it; the row's appearance is itself the signal.
- **Cross-lens pulse** — only SharedLens pulses, not the other lenses. Adding a global "recently mutated" store is overkill for this iteration.

## Build / lint state

- `npm run build` (vite + tsc -b) green.
- Bundle: +2.4 KiB after minification.

## Manual smoke (to do)

1. Open Shared lens with at least 3 shared rows.
2. Drag a chip onto another row and release. Both rows should update **before** the network roundtrip — pulse for ~1.5s.
3. Throttle the network in DevTools and repeat — UI still updates instantly; network response just confirms.
4. Force a server error (e.g. revoke RPC grant temporarily, or break payload). Rows should snap back; toast shows error.
5. Switch to Ledger — same updated row reflects there too.
6. Open the public `/share/:slug` in another tab — after invalidate it picks up the new state.

## Phase 8+ (out of this ticket)

- Code-split: bundle is 1.19 MB minified. Worth a follow-up to dynamic-import the lens routes. Tracked separately.
- Cross-lens diff highlight (would need a tiny zustand slice).
- Per-row "Undo" button on the toast that reverses the last redistribute.

## Closing note

This concludes BUDG-022's planned phases. Sequence:

1. Read-only Shared Lens (Phase 1)
2. Same-month DnD redistribute (Phase 2) — introduced `redistribute_shared` RPC; ADR-004 superseded ADR-003.
3. Cross-month + drop-zone create (Phase 3)
4. Recurring sources via `recurring_overrides` (Phase 4)
5. Long-press picker mode for touch (Phase 5)
6. Standalone "+ Add shared event" (Phase 6)
7. Optimistic updates + pulse (Phase 7, this entry)

Ticket can move to QA / acceptance.
