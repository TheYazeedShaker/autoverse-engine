> Carried over from the Phase-0 repo on 2026-09-21 (REV2 0-H.5) so code references resolve. Paths updated to this repo; the decision is unchanged.

# ADR-0006 — Lucide as the icon system

**Status:** accepted (2026-06-25) · locked by the user per spec revision R1.3.

## Context

Several components (buttons, alerts, breadcrumbs, segmented controls) need icons. We want a single,
consistent, tree-shakeable icon set whose size/colour come from the design system, not from call sites.

## Decision

Adopt **Lucide** (`lucide-react`) — a large, consistent, ISC-licensed set that tree-shakes (each icon is
a separate named export). It is wrapped in an **`Icon` primitive** (`@autoverse/ui`) so that:

- **Size** comes from the system (`sm` 16 / `md` 20 / `lg` 24, tracking the spacing scale), not raw props.
- **Colour** is `currentColor` (Lucide's default stroke), so icons inherit the themed foreground and stay
  AA on any surface — never a hardcoded colour.
- **Accessibility** is built in: decorative icons render `aria-hidden` + `focusable={false}`; a `label`
  promotes the icon to `role="img"` with an accessible name.

Consumers import the glyph from `lucide-react` and pass it: `<Icon icon={Car} label="Vehicle" />`.

## Alternatives considered

- **Phosphor / Tabler** — comparable quality; no reason to diverge. Either would still be wrapped in the
  same token-driven `Icon` primitive.
- **A name→component map** (`<Icon name="car" />`) — rejected: it defeats tree-shaking by pulling the whole
  set into the bundle.

## Consequences

- **Good:** consistent iconography; tree-shakeable; size/colour/a11y enforced by the wrapper; ISC licence
  is permissive.
- **Bad / accepted:** call sites import the specific glyph (a tiny bit more verbose than a name string), in
  exchange for bundle savings. Stroke width is currently a constant in the wrapper (1.75) — tokenize it if a
  stroke token is ever added.

Referenced by `packages/ui/src/components/Icon/Icon.tsx`.
