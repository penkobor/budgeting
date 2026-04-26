# 00 Agent Workflow — Lifecycle & Stages

**Authoritative guide for LLM agents working on a ticket in this vault.**
Pair this with [[00 Vault Guide]] (which defines *where* files live).

---

## Core Principle

Work on a ticket is a pipeline of **stages**. Each stage produces a **named artifact** in a **fixed location**. The agent MUST check, before writing any note, which stage it is in and place the file accordingly. No stage is allowed to be silently skipped; an empty stub is always preferable to missing the artifact.

This vault uses **`BUDG-NNN`** ticket IDs (self-assigned, monotonic, no Jira backing).

---

## The Seven Stages

| # | Stage | Artifact | Location |
|---|-------|----------|----------|
| 1 | **Discovery** | Index file with summary | `Tickets/BUDG-NNN — <AREA> \| <Title>/BUDG-NNN.md` |
| 2 | **Analysis** | Research / gap / impact / audit notes | `Tickets/BUDG-NNN — …/Analysis/BUDG-NNN - <Description>.md` |
| 3 | **Plan** | Single Plan file with tasks, tests, non-goals | `Tickets/BUDG-NNN — …/Implementation/BUDG-NNN - Plan.md` |
| 3b | **ADR** | One file per non-obvious design decision | `Tickets/BUDG-NNN — …/ADR/BUDG-NNN - ADR-MMM - <Title>.md` |
| 4 | **Prompts** | Numbered prompts driving LLM sessions | `Tickets/BUDG-NNN — …/Prompts/NN-description.md` |
| 5 | **Implementation Log** | **One file per work session** inside `Log/` folder | `Tickets/BUDG-NNN — …/Implementation/Log/BUDG-NNN - YYYY-MM-DD - <slug>.md` |
| 6 | **QA** | Test cases, reproduction guides, review fixes | `Tickets/BUDG-NNN — …/QA/BUDG-NNN - <Description>.md` |
| 7 | **Retrospective** | Learnings extracted for reuse | `Learnings/Patterns/<Topic>.md` |

---

## Stage Details

### Stage 1 — Discovery (obligatory, first)
- **Trigger:** a new ticket starts.
- **Actions:**
  1. Pick the next free `BUDG-NNN` (look at the highest existing in `Tickets/` and increment).
  2. Create folder `Tickets/BUDG-NNN — <AREA> | <Title>/` (em-dash `—`, pipe `|`, full title).
  3. Create all six subfolders (`.gitkeep` in each empty one).
  4. Create `BUDG-NNN.md` from the Ticket Index template in [[00 Vault Guide]].
  5. Add a bullet to [[00 Vault Index]] under `## Tickets`.

### Stage 2 — Analysis (as many notes as needed)
- **Trigger:** investigating current behavior / designing the approach.
- **Artifacts go in:** `Analysis/`.
- **Rules:** Each note has a header and ends with `*Part of [[BUDG-NNN]]*`. Register in the ticket index under `### Analysis`.

### Stage 3 — Plan (exactly one file, required)
- **Trigger:** analysis is sufficient to commit to an approach.
- **Artifact:** `Implementation/BUDG-NNN - Plan.md` (Plan template in [[00 Vault Guide]]).
- **Rules:** One Plan per ticket. Re-plans replace sections in place. Plan contains: Goal, Tasks (checkboxes), Tests, Non-goals. Never mix in dated progress.

### Stage 3b — ADR (one file per non-obvious design decision)
- **Trigger:** picking between two or more non-trivial approaches (e.g. routing strategy, auth strategy, library choice, data model tradeoff).
- **Artifact:** `ADR/BUDG-NNN - ADR-MMM - <Title>.md`.
- **Rules:** One decision per ADR. MMM zero-padded per-ticket from 001. Sections: Status, Context, Decision, Consequences (Positive/Negative/Neutral), Alternatives considered. Once **Accepted**, Decision and Consequences are immutable — corrections require a new ADR that supersedes the old one. Register under `### ADRs`.

### Stage 4 — Prompts (one per LLM sub-task)
- **Artifact:** `Prompts/NN-description.md` where `NN` is a zero-padded sequence number.
- **Rules:** Lowercase-kebab name, no `BUDG-NNN` prefix (folder implies it). Content: literal prompt + short "Outcome" note after the session. Register under `### Prompts`.

### Stage 5 — Implementation Log (required, **one file per session**, inside `Log/` folder)
- **Trigger:** work was actually executed (code changes, deploys, verification runs).
- **Artifact:** new file `Tickets/BUDG-NNN/Implementation/Log/BUDG-NNN - YYYY-MM-DD - <kebab-slug>.md`.
- **Rules:** One file per session. Never append to an existing entry from a different session. Distinguish multiple sessions on the same day via slug suffix. Follow the Log entry template. Register under `### Implementation Log` newest-first.

### Stage 6 — QA
- **Artifacts go in:** `QA/`. Reproduction guides, test-case lists, review fix logs.

### Stage 7 — Retrospective (optional but encouraged)
- **Artifact:** `Learnings/Patterns/<Topic>.md`. Pattern notes link back to ticket(s) via `[[BUDG-NNN]]`.

---

## Decision Flowchart

```
Is it about a specific ticket?
├── No → Learnings/Patterns/ OR Journal/ OR Scratch/
└── Yes → which stage?
    ├── Investigating behaviour        → Analysis/
    ├── Committing to an approach      → Implementation/BUDG-NNN - Plan.md
    ├── Non-obvious design decision    → ADR/BUDG-NNN - ADR-MMM - <Title>.md
    ├── Driving an LLM session         → Prompts/NN-description.md
    ├── Recording what was done        → Implementation/Log/BUDG-NNN - YYYY-MM-DD - <slug>.md (new file per session)
    ├── Tests / repro / review fixes   → QA/
    ├── API contract work              → API/
    └── Extracting a reusable lesson   → Learnings/Patterns/
```

---

## Agent Checklist (before creating any file)

1. ☐ Is the target folder structure present? If not, create the full skeleton.
2. ☐ Does the file name follow R4 in [[00 Vault Guide]]?
3. ☐ Is the correct stage being used (see flowchart)?
4. ☐ Is the ticket index being updated with the new bullet?
5. ☐ Does the note include the ticket backlink `*Part of [[BUDG-NNN]]*`?
6. ☐ Plan and Log are never mixed — one file each.
7. ☐ If the artifact doesn't fit a stage, drop it in `Scratch/` and ask.

---

## Anti-patterns (do not do these)

- ❌ Creating both `BUDG-NNN - Implementation Plan.md` *and* `BUDG-NNN - Plan.md` — only the canonical name.
- ❌ Piling multiple work sessions into one Log file.
- ❌ `Implementation/BUDG-NNN - Log.md` (single-file form) — must be the folder form.
- ❌ Daily logs like `BUDG-NNN - Daily Log 2026-04-26.md`.
- ❌ Loose files in the vault root.
- ❌ Flat ticket folder with notes directly inside.
- ❌ Prompt files with ticket-prefixed names inside `Prompts/`.
- ❌ Burying a design decision inside `Plan.md` or a Log entry instead of writing an ADR.
- ❌ Editing an accepted ADR's Decision/Consequences — write a new ADR that supersedes it instead.
