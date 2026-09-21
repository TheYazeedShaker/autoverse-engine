> Carried over from the Phase-0 repo on 2026-09-21 (REV2 0-H.5) so code references resolve. Paths updated to this repo; the decision is unchanged.

# ADR-0007 — Tailwind (v4) + shadcn/ui as the styling layer

**Status:** accepted (2026-06-29) · locked by the user.

## Context

CLAUDE.md §3 mandates **"Tailwind + shadcn/ui, themed from `@autoverse/tokens`."** The early primitives
(Surface, Icon, Text) used inline styles + CSS vars, which is fine for static atoms but **cannot express
pseudo-states** (`:hover`/`:focus-visible`/`:disabled`/`:active` — needed by Button and every form/overlay
control) **or media queries** (responsive Grid). The interactive components are also locked onto **Radix**
(ADR-0004, at Button), and shadcn/ui is precisely Radix + Tailwind. So the styling layer had to be wired
before more components accrued (building them inline then switching = rework).

## Decision

Adopt **Tailwind CSS v4** as the styling layer, **bridged to the design tokens**:

- A `@theme inline` block (`packages/ui/src/styles/tailwind.css`) maps the `--av-*` tokens to Tailwind
  utilities (`bg-surface`, `text-on-surface`, `rounded-md`, `font-sans`, the status colours, elevation, type
  scale…). `inline` makes each utility reference the live `--av-*` var, so surface theming keeps working and
  components **still never touch raw hex/px** — they use token-named utilities.
- Wired into **Storybook** first via `@tailwindcss/vite` (`viteFinal`), since that's where components render
  today. **shadcn/ui** components (Radix + these utilities) get generated per-interactive-component starting
  at Button.
- **Deferred (fast-follow):** the Next-app Tailwind integration (`@tailwindcss/postcss`) — wire it when the
  app first consumes `@autoverse/ui` components; and migrating the existing inline-style primitives
  (Surface/Icon/Text) to utilities.

## Alternatives considered

- **Keep inline styles + CSS vars** — rejected: can't do pseudo-states or responsive; diverges from CLAUDE.md
  §3 and shadcn; would force bespoke per-component CSS.
- **CSS Modules** — viable but more boilerplate than Tailwind, and not the mandated/shadcn path.

## Consequences

- **Good:** states + responsive + the whole utility ergonomics; shadcn/Radix drop-in for interactive
  components; tokens stay the single source (utilities are generated from them); verified — the token-mapped
  utilities appear in the Storybook build.
- **Bad / accepted:** Tailwind preflight resets base styles in the Storybook canvas (intended for a design
  system). Two integrations remain to wire later (the Next app) and a migration pass for the 3 inline-style
  primitives. Tailwind v4 is CSS-first (no `tailwind.config.js`); the legacy `tailwind-preset.js` in
  `@autoverse/tokens` is now superseded by the `@theme` bridge.

Referenced by `packages/ui/src/styles/tailwind.css`, `packages/ui/.storybook/main.ts`.
