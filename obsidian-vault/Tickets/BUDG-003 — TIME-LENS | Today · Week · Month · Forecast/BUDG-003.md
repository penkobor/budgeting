# BUDG-003 — TIME-LENS | Today · Week · Month · Forecast

**Repo:** [penkobor/budgeting](https://github.com/penkobor/budgeting)
**Live:** https://penkobor.github.io/budgeting/
**Status:** In Progress
**Started:** 2026-04-26
**Source:** User feedback after BUDG-002 — wants the app to answer "how much can I spend today / this week / this month?" first, and "how much will I have in N months?" second.

---

## Summary

The current Dashboard answers "where am I in this month?" — useful, but not the
question the user actually opens the app for. They want a **time-lens**:
Today / Week / Month / Forecast, where each lens shows a planned figure
(taken from the ledger forecast) versus what's actually spent so far,
plus a clear "X left to spend" headline.

Forecast extends the lens beyond the current month: a configurable horizon
(N months ahead) driven by recurring rules, with a small **scenarios**
panel so the user can ask "what if salary +10k" / "what if spending −15%".

---

## Notes

### Analysis
- _none yet_

### Implementation
- [[BUDG-003 - Plan]] — period-lens chip switcher on Dashboard + scenarios

### Implementation Log
- _will be added per session_

### QA
- _none yet_

### API
- _none yet — uses existing transactions / recurring tables_

### Prompts
- _driven directly from chat feedback_

### ADRs
- [[BUDG-003 - ADR-001 - Period switcher on Dashboard, not separate routes]]

---

*Part of [[00 Vault Index]]*
