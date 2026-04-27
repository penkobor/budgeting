# BUDG-020 — ADR-003 — No commitments or limits in MVP

*Part of [[BUDG-020]]*

**Status:** Accepted (2026-04-27)
**Date:** 2026-04-27

## Context

Initial requirements seemed to suggest a budgeting envelope with limits ("we'll spend €400/month on outings"). Two refinements ago, the model included:
- Per-member `monthly_commitment` reserving part of personal `monthly_goal`.
- Space-level `monthly_limit`.
- Headroom indicator showing how much of personal free budget remains, visible to other members (with a privacy toggle).

During refinement the user pushed back twice: "лимита даже не нужно" and "никогда" (about headroom). The actual mental model is:
- "Shared transactions tagged in my Ledger naturally show up as part of the joint counter. We can see what we *plan* to spend together and what we've already spent. That's it."

The existing `transactions.planned` + `transactions.confirmed_at` flags already provide the planned-vs-spent distinction needed.

## Decision

**Drop limits, commitments, and headroom from MVP.** A space has no monetary limit. Members do not declare commitments. Other members do not see each other's free-budget remaining.

The Space view shows aggregations of shared transactions only:
- Planned (shared tx where `confirmed_at IS NULL`)
- Spent (shared tx where `confirmed_at IS NOT NULL`)
- Remaining-of-planned = Planned − Spent

Period switcher (week / month / 3m / year) operates on the same raw data.

## Consequences

**Positive**
- Drastically simpler schema: no `monthly_commitment` column, no `monthly_limit` column, no per-member reservation arithmetic, no rebalance-on-overspend logic.
- No interaction with `BUDG-012` monthly-goal rebalance — they remain orthogonal. Personal goal stays personal.
- No privacy concerns about exposing personal free-budget figures.
- The user can already see what we want from "planned vs spent" using existing tx fields.
- Faster to ship. The whole feature becomes "tagging + shared view" — minimal moving parts.

**Negative**
- The "we have €5000 free for a trip" question is not answered by the app — both partners must reason about it manually using their personal Dashboards.
- If users later want budget envelopes per shared category, a new ADR will reverse this decision (or add limits as an opt-in feature).
- No pressure mechanism to stop overspending — purely informational.

**Neutral**
- Re-introducing limits later is additive (new nullable columns, new UI). This decision does not foreclose future evolution.

## Alternatives considered

### Per-member commitments + derived space limit
Rejected per user feedback (commitments felt artificial; user does not pre-commit amounts).

### Single space-level limit (no commitments)
Rejected per user feedback ("лимита даже не нужно").

### Soft progress bars with no enforcement
Considered: show "Planned: €1200 / typical €X" using historical average. Rejected for MVP — adds complexity without a clear product requirement; user did not ask for it.

## References
- Refinement: [[BUDG-020 - Refinement Discussion]] (model evolution v1 → v3)
- Related (orthogonal): [[BUDG-012]] — personal monthly goal + rebalance flow
