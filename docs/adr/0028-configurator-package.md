# 0028 — `packages/configurator`: the image-sequence engine as a client-only package

**Status:** accepted — 2026-11-21 (owner; `docs/merge-map/decisions.md` D18)

## Context

The showcase's configurator engine is a framework-free ES module of about 2,300 lines:

- an exterior 360° from image sequences on a canvas;
- interior panoramas in WebGL, with Pannellum loaded lazily;
- interactions;
- linked viewers;
- a worker decode pool.

It is ported, not redesigned (owner decision). Three places will use it:

- the consumer pages (configurator, compare, brochure);
- the embed route;
- the admin's "Preview draft".

`packages/engine-core` is the typed data-access layer and also runs on the server, so it must stay free of canvas and WebGL.

## Decision

1. **A new workspace package, `packages/configurator`.**
   - Client-only and strict TS.
   - It keeps the engine's public API and event names, including the five undocumented events, now with a typed event map.
   - Its manifest is parsed with Zod, then normalised.
   - It is loaded with `dynamic(..., { ssr: false })` after first paint. As a heavy embed it is excluded from the initial-load budget (production plan §15).
2. **The engine's pure parts move to `engine-core`:**
   - the manifest normaliser's rules;
   - pricing and availability;
   - swatches;
   - the brochure's trims-and-colours rule.

   These run on the server too (for example, `capture-lead` recomputes a price).

3. **No brand in the package.**
   - The manifest URL comes from data, not a build constant.
   - Interface strings (aria labels, hints, control names) come from the page in EN and AR.
   - Injected CSS becomes classes on token variables.
   - Motion uses ADR 0026's tokens.
   - Reduced motion is instant.
4. **The package's tests run in CI.** That covers the ported unit tests plus the browser checks, moved to Playwright.

## Alternatives considered

- **Inside `apps/consumer/lib/configurator`.** Rejected: the admin preview would import from another app.
- **All of it in `engine-core`.** Rejected: browser-only code in a package the server imports.

## Consequences

- **`CLAUDE.md`'s repo structure gains a line** (the owner's edit, D29).
- **The CSP** must allow `worker-src blob:` and the asset CDN for `img-src`/`connect-src`. That goes in the CSP note in ADR 0026.
- **One more package** to version and test. In exchange, the three users share one engine.
- **Deno can't import `engine-core` today.** The edge functions run on Deno, and `services/deno.json` maps only zod and supabase-js, so `capture-lead` can't reuse the pricing rules yet. C4a adds an import-map entry for the pure modules (or a generated copy, checked against the source in CI).
- **`packages/types` gains a runtime zod dependency** with the protocol adapter (ADR 0029).
