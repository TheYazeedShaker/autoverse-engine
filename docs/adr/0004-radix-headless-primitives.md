> Carried over from the Phase-0 repo on 2026-09-21 (REV2 0-H.5) so code references resolve. Paths updated to this repo; the decision is unchanged.

# ADR-0004 — Radix Primitives as the headless interactive library

**Status:** accepted (2026-06-29) · the headless lib was locked in R1; this records the decision at the
first interactive component (Button).

## Context

CLAUDE.md §3 mandates **"Tailwind + shadcn/ui."** shadcn/ui is not a dependency — it is a pattern: unstyled
**Radix Primitives** wired to our Tailwind token utilities, with the component source living in our repo
(here, `@autoverse/ui`). Starting with Button, the design system needs interactive components — Button,
Swatch, SegmentedToggle, Modal, Select, Tooltip, Accordion, Switch, Radio — that must be **accessible by
construction**: correct ARIA roles/states, keyboard interaction, focus management, roving tabindex,
focus traps, dismissal, and collision-aware positioning. Hand-rolling these is the most common source of
a11y bugs and is explicitly the kind of work CLAUDE.md §7/§9 ("a11y on both surfaces + both directions",
"never hand-roll focus traps / roving tabindex") wants us to avoid.

## Decision

Adopt **Radix Primitives** (`@radix-ui/react-*`) as the single headless interactive library. Components in
`@autoverse/ui` are built **Radix-for-behavior + token-mapped Tailwind utilities for appearance** (the
shadcn approach), with the source owned in this repo rather than pulled from a registry.

- We depend on the **individual Radix packages per component** (e.g. `@radix-ui/react-slot` for Button's
  `asChild`, `@radix-ui/react-dialog` for Modal later), not a meta-package — keeps the bundle to what we use.
- **Styling stays ours:** Radix ships behavior + unstyled DOM; all colour/space/radius/type come from the
  `@theme` token bridge (ADR-0007). Radix never introduces a colour.
- **Variant ergonomics:** interactive components use **`class-variance-authority`** for variant/size maps
  plus **`clsx` + `tailwind-merge`** (the shadcn `cn`), so consumer `className` overrides merge correctly
  instead of duplicating. This upgrades the seed `cn` (a plain joiner) — adopted at Button, the first
  variant-heavy component.

## Alternatives considered

- **Headless UI** — smaller primitive set (no Slot, weaker menu/popover/positioning); doesn't cover the
  configurator-control surface we'll need.
- **React Aria (Adobe)** — excellent a11y but a hooks-first model that's heavier to wrap and diverges from
  the mandated shadcn path.
- **Hand-rolled** — rejected by §7/§9; re-implementing focus traps / roving tabindex / dismissal is exactly
  the bug surface we are paying Radix to remove.

## Consequences

- **Good:** accessibility (roles, keyboard, focus) is handled by a maintained library; consistent behavior
  across every interactive component; `asChild` composition lets a Button render as a link/`<a>` without
  losing styling; appearance stays 100% token-driven.
- **Bad / accepted:** per-component Radix dependencies accrue over time; a small toolchain addition
  (`class-variance-authority`, `clsx`, `tailwind-merge`). Radix's data-attributes (`data-state`, etc.) become
  part of our styling contract — fine, we target them with utilities.

Referenced first by `packages/ui/src/components/Button/Button.tsx`.
