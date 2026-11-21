# Build Spec — Configurator page

**Task ID:** `PAGE-CONSUMER-CONFIGURATOR`
**Depends on:** PAGE-CONSUMER-SHOWROOM; `packages/configurator` (ADR 0028); the configurator protocol types in `packages/types`, mapped onto the embed's messages (ADR 0029); the admin's Catalog I (A12) for data; `capture-lead`'s reserve and interest types (C4a). The streaming provider decision (StreamPixel at launch, provider-agnostic sessions) applies when pixel streaming comes back (below).
**Design source (read-only):** `design-approved/showroom/configurator.dc.html`.
**Standing rule: the approved design wins** on layout, visuals, copy and interaction; escalate only security, data, money, legal or consent questions.

## Goal

The base product: the brand's configurator in the approved page chrome, with option panels driven by engine data, a summary, and lead capture that carries the configuration. It has three modes (D17):

- **View** and **Build** run the image-sequence engine (`packages/configurator`, ADR 0028). Build steps through Exterior → Interior → Checkout.
- **Enhanced** iframes the configurator server, which stays where it is.

## Route and data

- `/configure/{model-slug}?trim={trim-slug}`; flag `page_configurator`, default off, plus `configurator_enhanced` and `configurator_build_checkout`. Same host/brand resolution. The showcase's `/configurator?model=…` redirects here with the query kept (D20).
- Options (exterior colour, interior colour, wheels, interior themes) from `option_assignments`, scoped per trim, ordered, with vocabulary ids.
- **The engine** loads client-only after first paint, poster first, from the brand-market's manifest (`models.asset_base_path`). It is a heavy embed, outside the route's initial-JS ceiling (D31).
- **Enhanced** iframes `models.enhanced_url`, with `sandbox` and `allow` set. It is never blank: its fallback is View mode.
- **Pixel streaming is deferred** until a brand needs it (D17). The provider-agnostic session layer stays the plan for it: the page asks the engine for a session (a new edge function, e.g. `start-config-session`, authorised like the public capture functions: publishable key + origin + rate limit), gets an embed URL/token, and renders the provider iframe. No provider secrets ever reach the browser. Sessions are metered (start, end, duration) for cost tracking.

## Behaviour notes

- **Protocol:** page ↔ configurator messages use the typed, versioned protocol (discriminated unions), mapped onto the embed's `nmesis:*` messages (v1.2, ADR 0029); unknown or mismatched messages are ignored and logged. Option changes are sent as commands; the configurator's acknowledgements update the UI.
- **Build rules:** an option that isn't selectable or is out of stock can't be chosen; an invalid combination is corrected, never shown.
- **Fallback ("light" mode):** if the engine can't start (slow network, missing frames, an unsupported protocol version), show the static renders for the trim with the same option panels (no faked colours, same rule as the brochure) and a clear note. The page must never be blank.
- **Summary:** the chosen options, the trim's from-price, and the lead CTA. The lead carries a configuration snapshot (vocabulary ids only, no free text) and the server-recomputed price, so the brand sees exactly what was built.
- **Events:** option changes feed the slice-9 event pipeline (consent rule B applies).

## PRs (at most 3, against `main`)

1. Configurator page I (C3): route, the approved chrome, View mode, option panels from data, the poster-first engine load.
2. `capture-lead`: the reserve and interest types, the configuration snapshot, the server-recomputed price (C4a; its own PR, with `security-review`).
3. Configurator page II (C4b): Build mode, pricing and availability, checkout through the lead modal, the Enhanced iframe (flagged), events, motion, visual verification.

## Needs from the owner (Tier C)

- The consent wording for the checkout's lead form (human only).
- Only when pixel streaming comes back: StreamPixel project/app credentials, which Unreal build/app to point at (stored as Supabase secrets), and the per-session cost cap, if any.

## Acceptance

- [ ] Visual verification against the design (screenshots attached), including fallback mode.
- [ ] No secret in the browser bundle or network responses; the Enhanced iframe is sandboxed, and the embed's origins are locked (ADR 0029).
- [ ] Fallback mode appears when the engine can't start; the page is never blank.
- [ ] Lead includes the configuration snapshot; cross-tenant and isolation tests green.
