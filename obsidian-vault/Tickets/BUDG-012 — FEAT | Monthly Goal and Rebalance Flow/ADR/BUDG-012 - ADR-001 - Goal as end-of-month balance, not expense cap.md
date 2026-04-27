# BUDG-012 — ADR-001 — Goal as end-of-month balance, not expense cap

**Status:** Accepted
**Date:** 2026-04-27

## Context
Personal-budgeting apps typically model a monthly goal as one of:
1. **Expense cap** — "spend no more than 25,000 CZK this month".
2. **Savings target** / **end-of-month balance** — "have at least 5,000 CZK left at month end".
3. **Per-category envelope budgets** — separate cap per category.

User explicitly described the goal as: *"финальная сумма в конце месяца, включая любые транзакции"* — the leftover after all income and expenses. That is option (2).

Option (3) is a different paradigm (envelope budgeting); explicitly out of scope.

## Decision
Goal is stored and evaluated as a **target end-of-month balance**:

`projected_end_balance = current_balance + Σ(future income for month) − Σ(future expenses for month)`
Goal met when `projected_end_balance ≥ goal_amount`.

The rebalance flow triggers only on **expense** additions (income improves the projection — no rebalance needed; if income clears a previous overage, that simply turns the goal back to "on track" silently).

## Consequences

- ✅ Aligns with the user's mental model (savings target, not a cap).
- ✅ Naturally absorbs income variability — extra freelance income relaxes the budget without requiring user to update the goal.
- ✅ Single number to set; no per-category complexity.
- ⚠️ User can be confused by "negative" balance vs "exceeded cap" framing. Mitigation: copy framed as *"On track to end at X / Goal: Y"*, not *"Spent X / Cap Y"*.
- ⚠️ Must use signed projection math throughout. Bugs in sign handling will silently change the trigger condition.
- ⚠️ Income transactions don't trigger rebalance even if posted late in the month — explicitly fine, but document it in the help copy on the goal card.

## Alternatives considered

1. **Expense cap** — simpler math but ignores income, which the user's framing centers on. Rejected.
2. **Net spend cap** (expenses − income ≤ N) — equivalent in math to (2) but reframed against the wrong intuition. Rejected — same math, worse copy.
3. **Per-category envelopes** — much heavier UX (budgets per category, rollover, transfers between envelopes). Out of scope.
4. **Trigger rebalance on any transaction** — including income would create a confusing "good news" flow. Rejected — only expenses can violate the goal.

---

*Part of [[BUDG-012]]*
