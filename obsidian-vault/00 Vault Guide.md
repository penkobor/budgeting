# 00 Vault Guide — Structure & Conventions

**Authoritative rules for humans and LLM agents.**
Read [[00 Agent Workflow]] next — it defines *when* to create each artifact.

This vault is adapted from the global vault structure (`~/hwp/obsidian-vault`) for the personal budgeting_app project. There is no Jira — ticket IDs are self-assigned in the form **`BUDG-NNN`** (zero-padded, monotonic).

---

## Top-level Layout

```
obsidian-vault/
├── 00 Vault Index.md          ← root navigation hub
├── 00 Vault Guide.md          ← this file (structure rules)
├── 00 Agent Workflow.md       ← agent workflow & lifecycle stages
├── Attachments/               ← loose images, PDFs, screenshots
├── Journal/                   ← daily notes: YYYY-MM-DD.md
├── Learnings/
│   ├── Code-Review/           ← lessons from PR reviews / retros
│   └── Patterns/              ← reusable patterns, conventions, recipes
├── Scratch/                   ← unlinked drafts, .canvas, .base, one-offs
└── Tickets/
    └── BUDG-NNN — <AREA> | <Title>/        ← one folder per ticket (full human-readable name)
        ├── BUDG-NNN.md        ← ticket index (hub)
        ├── Analysis/          ← gap analysis, audits, deep dives, research
        ├── Implementation/
        │   ├── BUDG-NNN - Plan.md   ← REQUIRED — what we plan to do
        │   └── Log/                 ← REQUIRED folder — one file per work session
        │       └── BUDG-NNN - YYYY-MM-DD - <slug>.md
        ├── Prompts/           ← numbered LLM-session prompts
        ├── QA/                ← test cases, reproduction guides, review fixes
        ├── API/               ← API contract analysis, OpenAPI comparisons
        └── ADR/               ← architectural decision records (immutable)
```

Empty subfolders keep `.gitkeep`.

`<AREA>` is a short uppercase tag describing the kind of work (e.g. `INIT`, `FEAT`, `INFRA`, `BUG`, `UX`, `DATA`).

---

## Hard Rules (the agent must follow)

### R1 — Never write loose files in the vault root
The only root files are the three `00 …` markdown files. Everything else goes into a topic folder.

### R2 — Every ticket has the full subfolder skeleton
Even if empty (with `.gitkeep`). Subfolders: `Analysis/`, `Implementation/`, `QA/`, `API/`, `Prompts/`, `ADR/`.

### R3 — Plan is a single file, Log is a folder
Every ticket MUST have:
- `Tickets/BUDG-NNN/Implementation/BUDG-NNN - Plan.md` — what we plan to do (checklists, tasks, non-goals). **Single canonical file.** Re-plans replace sections in place — never fork to a `Plan v2.md`.
- `Tickets/BUDG-NNN/Implementation/Log/` — **folder**. **One markdown file per work session**, named `BUDG-NNN - YYYY-MM-DD - <kebab-slug>.md`. Never pile multiple sessions into one file.

**Plan ≠ Log.** Plan = intent. Log = dated history. Never merge.

### R4 — File naming
| Pattern | Use |
|---------|-----|
| `BUDG-NNN — <AREA> \| <Title>/` | Ticket folder name (em-dash `—`, pipe `\|`). Example: `BUDG-001 — INIT \| Bootstrap Personal Budgeting PWA/`. Obsidian `[[BUDG-NNN]]` wiki links resolve via the `BUDG-NNN.md` filename inside. |
| `BUDG-NNN - <Description>.md` | Ticket-specific note in `Analysis/` / `QA/` / `API/` |
| `BUDG-NNN - Plan.md` | Canonical Implementation Plan file (single per ticket) |
| `BUDG-NNN - ADR-MMM - <Title>.md` | Architectural Decision Record in `ADR/`. MMM is zero-padded, per-ticket sequence starting at 001. |
| `BUDG-NNN - YYYY-MM-DD - <slug>.md` | Log entry inside `Implementation/Log/`. One file per work session. `<slug>` is lowercase-kebab; must be unique within the same date. |
| `NN-description.md` (lowercase-kebab) | Prompt file inside `Prompts/` (e.g. `03-add-transactions-dialog.md`) |
| `BUDG-NNN.md` | Ticket index (no suffix) |
| `YYYY-MM-DD.md` | Daily note in `Journal/` |
| `<Topic>.md` in `Learnings/Patterns/` | Reusable pattern note |
| `00 <Name>.md` | Vault-root meta files only |

### R5 — Every note has a backlink
Ticket notes end with `*Part of [[BUDG-NNN]]*`. Learning notes link the originating ticket if any. Daily notes are standalone.

### R6 — Ticket index is the hub
`BUDG-NNN.md` lists every note in the ticket under sections matching the subfolders: Analysis / Implementation / QA / API / Prompts / ADR. Update the index when adding a note.

### R6b — ADRs are immutable
Once an ADR's Status is `Accepted`, its Decision and Consequences sections are frozen. To revise, write a new ADR that **Supersedes** the old one (and update the old one's Status to `Superseded by ADR-MMM`). Use ADRs for non-obvious design choices (library selection, pattern tradeoffs, data-model decisions). Do NOT bury decisions in `Plan.md` or Log entries.

### R7 — Scratch is isolated
Files in `Scratch/` are not linked from any index. Use it for drafts, `.canvas`, `.base`, or experiments.

---

## Ticket Index Template

```markdown
# BUDG-NNN — <Area> | <Title>

**Repo:** [penkobor/budgeting](https://github.com/penkobor/budgeting)
**Status:** <In Progress | Done | Blocked>
**Started:** YYYY-MM-DD
**Branch:** `feature/budg-NNN-slug` _(optional)_

---

## Summary

<2–4 sentences: what, why, and current shape.>

---

## Notes

### Analysis
- [[BUDG-NNN - <Note>]] — one-line description

### Implementation
- [[BUDG-NNN - Plan]] — what we plan to do

### Implementation Log
_list entries newest-first; each bullet points to one file in `Implementation/Log/`:_
- [[BUDG-NNN - YYYY-MM-DD - <slug>]] — one-line summary

### QA
- _none yet_

### API
- _none yet_

### Prompts
- [[NN-description]] — what this prompt drives

### ADRs
- [[BUDG-NNN - ADR-001 - <Title>]] — one-line summary

---

*Part of [[00 Vault Index]]*
```

---

## Plan.md Template

```markdown
# BUDG-NNN — Plan

**Ticket:** [[BUDG-NNN]] — <Title>
**Type:** Implementation Plan

---

## Goal
<1–2 sentences>

## Tasks
### <Area / surface>
- [ ] <task>

## Tests
- [ ] <test>

## Non-goals
- <out of scope>

---

*Part of [[BUDG-NNN]]*
```

## Log entry template (one file per work session)

Path: `Tickets/BUDG-NNN/Implementation/Log/BUDG-NNN - YYYY-MM-DD - <slug>.md`

```markdown
# BUDG-NNN — <Short summary of this session>

**Ticket:** [[BUDG-NNN]] — <Title>
**Date:** YYYY-MM-DD
**Type:** Implementation Log (entry)

---

## Context
<1–3 sentences: why this session happened.>

## Changes
- file or area touched — what changed and why

## Verification
- tests / commands run
- regression status

## Follow-ups
- <deferred items, TODOs, next-session pointers>

---

*Part of [[BUDG-NNN]]*
```

## ADR template (one file per decision)

Path: `Tickets/BUDG-NNN/ADR/BUDG-NNN - ADR-MMM - <Title>.md`

```markdown
# BUDG-NNN — ADR-MMM — <Short Decision Title>

**Ticket:** [[BUDG-NNN]] — <Ticket Title>
**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Superseded by [[BUDG-NNN - ADR-LLL - ...]]
**Supersedes:** <link to prior ADR if any, else none>

---

## Context
<What problem / situation forces a decision? What constraints apply?>

## Decision
<The chosen approach, stated clearly and concisely.>

## Consequences
### Positive
- <good things this buys us>

### Negative
- <costs, risks, new obligations>

### Neutral
- <things it does not change>

## Alternatives considered
### Option A — <name>
- Pros: ...
- Cons: ...
- Rejected because: ...

---

*Part of [[BUDG-NNN]]*
```

**ADR rules:**
- One decision per ADR.
- MMM numbering is **per-ticket**, starts at 001, zero-padded to 3 digits.
- Once **Accepted**, the Decision and Consequences sections are immutable.
- Always register in the ticket index under `### ADRs`.

---

## When in doubt

1. Read [[00 Agent Workflow]] — it tells you *which artifact* to create for the current stage.
2. Check this file — it tells you *where* it goes.
3. If neither applies, drop it in `Scratch/` and ask the user.
