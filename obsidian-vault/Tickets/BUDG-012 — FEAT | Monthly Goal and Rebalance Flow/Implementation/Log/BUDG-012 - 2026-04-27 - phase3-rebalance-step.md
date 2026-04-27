# BUDG-012 — 2026-04-27 — phase3-rebalance-step

*Part of [[BUDG-012]]*

## Goal for this session
Wire the two-step Add-Transaction wizard. When an expense pushes projected
end-of-month balance below the goal, show step 2: pick future planned
expenses to trim, distribute the overage, apply.

## Execution

### 1. `distributeEvenly()` — `src/lib/projection.ts`
Pure helper. Inputs: `PlannedOccurrence[]` and `overage` (positive). Output:
`{ deltas: Map<key, amount>, excluded: Set<key>, covered, leftover }`.

Algorithm:
1. Round overage to integer cents.
2. Compute even share `floor(remaining / pool.length)`.
3. For each item, take `min(share, remainingCap)`. If share ≥ cap → record cap, mark excluded, drop from pool.
4. Loop until stable.
5. Sweep leftover cents one-by-one across survivors.

Excluded items keep their checkbox visible with a "fully used" annotation,
so the user understands why their share didn't change when they bumped
the selection.

### 2. `<RebalanceStep />` — `src/components/RebalanceStep.tsx`
Pure controlled presentation component. Inputs:
- candidates list, overage, currency.
- Lifted state: `selected: Set<string>`, `mode: 'even' | 'manual'`, `manualDeltas: Map`, plus computed `evenResult` and `totalCovered`.

Renders:
- Hero alert pill ("This will exceed your goal by N").
- Coverage strip: `to cover X / overage Y · short Z`.
- Mode toggle: Adjust manually ↔ Auto-distribute.
- Checkbox list of candidates with date + original amount; right side shows either −N → newAmount badge, "fully used" annotation, or a manual numeric input clamped to original amount.

`<RebalanceStepFooter />` is a sibling export so the parent (`AddTransactionDialog`) can render it inside the Modal's footer slot.

### 3. `<AddTransactionDialog />` rewrite
- Added `step: 'form' | 'rebalance'` state machine.
- On submit (form):
  - Build `txPayload`.
  - If kind === 'expense' AND not editing AND a goal exists for the month AND opening balance is known AND date is in that month:
    - Recompute projected end with the new tx applied via `computeProjectedEndBalance`.
    - If projected < goal → `setStep('rebalance')`, capture pendingTx, overage, and candidates from `listFuturePlannedExpenses`.
  - Else: persist + close.
- Rebalance step lifts `selected/mode/manualDeltas/evenResult/totalCovered` so the Modal footer can compute `fullyCovered` and gate the Apply button.
- **Apply & save:** upsert overrides → upsert tx → close. Sequential mutations for now (atomic RPC is Phase 4).
- **Save anyway:** `window.confirm` ("This will exceed your monthly goal. Save anyway?") → save tx without overrides.
- **← Back:** `setStep('form')`.
- AnimatePresence with `mode="wait"` cross-fades between form and rebalance.

## Verification
- `npm run build` clean.
- Manual paths to verify on iPhone:
  - Add expense without goal → saves directly. ✅ (logic untouched).
  - Add expense with goal but projection still on track → saves directly. ✅
  - Add expense pushing projection below goal → step 2 appears. Coverage indicator updates as items are checked. Apply only enabled when fully covered. Save anyway shows confirm.
  - Empty candidates list → Save-anyway is the only way forward.

## Outcome
Closes Phase 3 of [[BUDG-012 - Plan]] (ST4 — rebalance nested step).

Phase 4 (atomic RPC) and Phase 5 (polish: dashboard alert ribbon, override
annotations on Recurring page, distribution-math tests) still open.

## Notes / risks
- Sequential mutations: if `upsertOverrides` succeeds but `upsertTx` fails, the user ends up with applied overrides but no saved tx → confusing state. Mitigation in Phase 4 is a Postgres RPC or a single batched edge function. For now, the failure window is small (single-user, network-fault only) and recoverable manually via Recurring page.
- Initial seed of `manualDeltas` happens on the first switch into `manual` mode (when `manualDeltas.size === 0`). Subsequent toggles preserve the user's manual edits.
- We assume `useMonthlyOpening(monthIso)` resolves; if it's still loading on Save we silently skip the rebalance check. That's acceptable — first-time submission while the cache warms shouldn't block the user.
