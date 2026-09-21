> Carried over from the Phase-0 repo on 2026-09-21 (REV2 0-H.5) so code references resolve. Paths updated to this repo; the decision is unchanged.

# ADR-0005 — Muted semantic status sub-palette

**Status:** accepted (2026-06-25) · locked by the user per spec revision R1.2.

## Context

The locked design system (CLAUDE.md §7) is a **cool neutral monochrome with no chromatic accent**, so it
never clashes with a tenant brand's colours. But state feedback — form validation on lead-capture forms,
and the `Alert` component — needs `error / success / warning / info` semantics that monochrome alone
conveys poorly. Pure-monochrome error states on the forms that capture leads (= revenue) are a real
usability risk.

## Decision

Add a **minimal, muted (desaturated) semantic sub-palette** to `@autoverse/tokens`, used **only** for
state feedback — never as a brand accent. It is modelled under the §4.2 surface↔foreground pairing rule:

- Paired subtle surfaces `errorSubtle / successSubtle / warningSubtle / infoSubtle` (tinted bg + readable
  `fg` + `fgMute`), registered in `surfaces` so the contrast invariant test covers them.
- `status` solids (`error / success / warning / info`) for borders, icons, and strong state text on the
  light canvas.

Every pair is enforced at **WCAG AA** by `packages/design-tokens/src/surfaces.test.ts` (subtle surfaces ≥ 4.5:1;
solids ≥ 3:1 on Mist as UI/large usage).

## Alternatives considered

- **Monochrome-only alerts** differentiated by icon + font-weight + border. Purer to the no-chromatic-accent
  rule, but materially worse usability on lead-capture validation. Rejected.

## Consequences

- **Good:** legible, accessible state feedback; the colours are desaturated enough to keep the premium
  monochrome feel; AA is structurally enforced so a bad status pair fails the build.
- **Bad / accepted:** this is a deliberate, sanctioned exception to "no chromatic accent" — **scoped
  strictly to feedback states.** Reviewers must reject any use of status colours as decoration or brand
  accent. The sub-palette is small and must stay that way.

Referenced by `packages/design-tokens/src/tokens.ts` (`status`, `surfaces.*Subtle`).
