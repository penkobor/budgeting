# BUDG-012 — ADR-002 — Recurring overrides table over template mutation

**Status:** Accepted
**Date:** 2026-04-27

## Context
The rebalance flow lets the user trim a single occurrence of a recurring expense (e.g. reduce a 800 CZK weekly grocery occurrence to 600 CZK to absorb a 200 CZK overage). Two ways to express that:

1. **Mutate the recurring template's amount** for all future occurrences.
2. **Per-occurrence override row** that decorates a single date without changing the template.

## Decision
Use a separate `recurring_overrides (recurring_id, occurrence_date, amount_override, skipped)` table. Forecast generation joins recurring templates with overrides and applies the override (or skip) for that specific date only.

## Consequences

- ✅ The recurring template stays the source of truth for "the usual amount" — future months continue projecting the original 800 CZK.
- ✅ Skipping an occurrence is cleanly representable (`skipped = true, amount_override = NULL`).
- ✅ Audit trail: easy to surface "this week's groceries trimmed by 200 from 800 to 600 to keep monthly goal" in the UI.
- ✅ User can revert a trim by deleting the override row — template untouched.
- ⚠️ Forecast queries become a left-join. Manageable with an index on `(recurring_id, occurrence_date)`.
- ⚠️ If user *wants* to permanently lower the template, that's an edit-recurring action — different code path.

## Alternatives considered

1. **Mutate template amount.** Wrong scope — changes ALL future occurrences, not just the one the user trimmed. Rejected.
2. **Snapshot all occurrences as concrete rows in `transactions` at month start.** Heavy — explodes recurring into N rows even if no overrides exist. Loses the benefit of generative projection. Rejected.
3. **Free-text "notes" per occurrence with implicit amount inference.** Too fuzzy to drive math. Rejected.

---

*Part of [[BUDG-012]]*
