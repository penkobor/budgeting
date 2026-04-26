# BUDG-001 — ADR-004 — Tailwind + CSS variables over component library

**Ticket:** [[BUDG-001]] — Bootstrap Personal Budgeting PWA
**Date:** 2026-04-26
**Status:** Accepted
**Supersedes:** none

---

## Context

The app needs:
- Light + dark themes that match the iOS system theme (and remember a manual override)
- Native-feeling touch targets and visual polish on iPhone (safe-area insets, large tap zones)
- Custom layouts (sidebar + bottom nav + FAB) that don't fit a generic dashboard template
- Small bundle size for fast load on cellular

Options for styling and components on the React + Vite stack:

1. **Plain Tailwind + custom components** — utility CSS, build your own primitives
2. **Tailwind + shadcn/ui (Radix-based)** — copy/paste accessible primitives into your repo, style with Tailwind
3. **Material UI / Mantine / Chakra** — full opinionated component library with built-in theming
4. **DaisyUI** — Tailwind plugin that adds named component classes (`.btn`, `.card`)

Constraints:
- One developer, no design system to enforce
- Need theming (light/dark) but not multi-tenant theming
- No SSR — the runtime cost of large component libraries is felt on mobile cold starts

---

## Decision

Use **Tailwind 3** with `darkMode: 'class'` + a small set of **CSS-variable-based component classes** (`.card`, `.btn`, `.input`, `.chip`, `.label`, `.stat-num`) defined in `src/index.css`. Theme tokens live as RGB tuples in `:root` and `.dark` and are referenced via Tailwind's `rgb(var(--*) / <alpha-value>)` colour functions.

For accessible primitives that are hard to roll by hand (modal, dropdown, tooltip), use **Radix UI primitives** directly (`@radix-ui/react-dialog` etc.), styled with Tailwind. Use **`cmdk`** for the command palette and **`framer-motion`** for the few animated overlays.

Do NOT pull in a full component library (MUI/Chakra/Mantine) or shadcn's generator scaffold.

---

## Consequences

### Positive
- Tiny CSS surface — themes are 12 CSS variables, not a 300-line theme object.
- Tailwind purge keeps the production CSS bundle small (~10 KB).
- Free choice of layout — no fighting library defaults for sidebar + bottom nav + FAB combo.
- Radix primitives are headless (zero CSS) and deliver a11y for free without bundling a design system.
- Easy to evolve theming (add a colour, swap a font) by editing CSS variables.

### Negative
- Every primitive (button, input, card) had to be hand-rolled — initial cost is non-trivial.
- No built-in form library / validation / typography scale — user has to maintain consistency manually.
- If the project grows to multiple contributors or needs a design system, this approach won't scale; would require migration to shadcn or similar.

### Neutral
- Future adoption of shadcn/ui is straightforward — they're both Tailwind+Radix, just with more pre-built components.
- Animation strategy (Framer Motion) is independent of the component-library choice.

---

## Alternatives considered

### Option A — shadcn/ui scaffold
- Pros: Tailwind+Radix done well; copy/paste primitives that you own; large community.
- Cons: Adds a CLI to manage; pulls in many components by default (some unused); the variants generator adds complexity that isn't justified for ~10 distinct UI primitives in this app.
- Rejected because: marginal gain over hand-rolling for an app this small. May reconsider later if the surface grows.

### Option B — Material UI / Chakra / Mantine
- Pros: Batteries-included; consistent look across all primitives.
- Cons: 50–150 KB of runtime CSS-in-JS; opinionated visual style that doesn't match iOS-native feel; heavy bundle hurts mobile cold start.
- Rejected because: bundle weight + visual mismatch.

### Option C — DaisyUI
- Pros: Predefined `.btn` / `.card` Tailwind classes; less hand-rolling.
- Cons: Adds another layer of class names to learn; theming is its own DSL; visual style is opinionated.
- Rejected because: no value over our 80-line custom component layer.

### Option D — Tailwind v4 (alpha at the time)
- Pros: New `@theme` syntax, Lightning CSS, simpler config.
- Cons: At the time of build, ecosystem (PostCSS plugins, vite-plugin-pwa peer ranges) was not yet aligned; pinning to v3 was the conservative choice.
- Deferred: revisit when v4 is stable and tooling has caught up.

---

*Part of [[BUDG-001]]*
