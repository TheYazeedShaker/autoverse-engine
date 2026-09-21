> Carried over from the Phase-0 repo on 2026-09-21 (REV2 0-H.5) so code references resolve. Paths updated to this repo; the decision is unchanged.

# ADR-0001 — Storybook hosted from `packages/ui`, Vite builder

**Status:** accepted (2026-06-25).

## Context

The design system needs a documented, testable home (CLAUDE.md §2 hard requirement). `@autoverse/ui`
already depends on `@autoverse/tokens`, so a single Storybook instance there can document both tokens
(foundations) and components without a second build target.

## Decision

- **One Storybook instance, configured in `packages/ui/.storybook/`** — no separate `apps/storybook`.
  Keeps it lean (priority §6.1) and avoids a second build target.
- **Builder: `@storybook/react-vite`** (Vite, not Webpack) — fast HMR/build, aligns with the
  ship-speed + performance requirements.
- **Storybook 10** (current stable, resolved at install — not pinned from the spec). Essentials +
  interactions are built into core in v10, so only the **a11y** and **themes** addons are added
  (every addon is build + maintenance weight, §8).
- The preview imports the same self-hosted `@font-face` + token CSS the app uses, so previews match
  production. Two toolbars: **surface** (Mist ↔ Gunmetal via `data-theme`) and **dir/lang**
  (ltr/en ↔ rtl/ar), so every story is verified on both surfaces and both directions.

## Alternatives considered

- **Separate `apps/storybook`** — rejected: a second build target and dependency wiring for no benefit.
- **Webpack builder** — rejected: slower, heavier than Vite for our needs.

## Consequences

- **Good:** single source of design-system docs; fast builds; previews are production-faithful (same
  fonts/tokens); cross-surface + bilingual verification is built into the harness.
- **Bad / accepted:** components and Storybook share one package, so the `ui` build pulls Storybook
  devDeps (dev-only; not shipped — `private: true`, `sideEffects: false`).

Referenced by `packages/ui/.storybook/`.
