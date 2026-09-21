> Carried over from the Phase-0 repo on 2026-09-21 (REV2 0-H.5) so code references resolve. Paths updated to this repo; the decision is unchanged.

# ADR-0003 — Self-host the brand fonts (Google Sans Flex + Cairo)

**Status:** accepted (2026-06-25).

## Context

Spec §4.3 requires the platform to not depend on Google's font API at runtime, **but** only if the
fonts' licenses permit self-hosting/redistribution — to be verified before vendoring (the task's one
external-dependency risk). The Phase-0 kit loaded both families from the Google Fonts CDN.

## Decision

**Verified, then self-hosted.** Both families are **SIL Open Font License 1.1**, which permits
redistribution and self-hosting:

- **Google Sans Flex** — released by Google under OFL 1.1 in Nov 2025 (confirmed via OMG! Ubuntu,
  Android Authority, and the Fontsource package's bundled licence).
- **Cairo** — OFL 1.1 (long-standing Google Fonts family).

The variable weight-axis woff2 are **vendored into `@autoverse/tokens/fonts/`** (Latin + Latin-ext for
Google Sans Flex, Arabic for Cairo) with each family's `OFL.txt` committed alongside. `tokens/src/fonts.css`
declares the `@font-face`s with `font-display: swap` and a Latin↔Arabic `unicode-range` split, and is the
single font source consumed by both the web app and Storybook. The Google Fonts CDN `<link>`s are removed.
No CDN fallback was needed, so the conditional fallback ADR does not apply.

## Alternatives considered

- **Keep the Google Fonts CDN** — rejected: runtime dependency on a third party, and §4.3 forbids it.
- **Depend on the `@fontsource-variable/*` npm packages** — used only as the source of correct files +
  licences, then removed; the binaries are vendored so the package is self-contained (no runtime/npm
  coupling for fonts).

## Consequences

- **Good:** no third-party font fetch at runtime; identical fonts in app + Storybook; lean (~112 KB total,
  subset-split so Arabic only loads for Arabic text); licences committed for compliance.
- **Bad / accepted:** font files are now committed binaries (marked `binary` in `.gitattributes`).
  A `<link rel=preload>` for the primary weight is **deferred** — with bundler-hashed font URLs a manual
  preload can't reliably match the `@font-face` request across both surfaces, and `font-display: swap`
  already makes loading non-render-blocking. Revisit if first-paint font swap proves visible.

Referenced by `packages/design-tokens/src/fonts.css`. (The Phase-0 `apps/web` references did not carry; the Engine apps will import the same file.)
