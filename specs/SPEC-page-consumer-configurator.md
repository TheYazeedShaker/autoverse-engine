# Build Spec — Configurator page

**Task ID:** `PAGE-CONSUMER-CONFIGURATOR`
**Depends on:** PAGE-CONSUMER-SHOWROOM; the configurator protocol types in `packages/types`; the streaming provider decision (StreamPixel at launch, provider-agnostic sessions).
**Design source (read-only):** `design-approved/showroom/configurator.dc.html`.
**Standing rule: the approved design wins** on layout, visuals, copy and interaction; escalate only security, data, money, legal or consent questions.

## Goal

The base product: the brand's real-time 3D configurator (Unreal via pixel streaming) embedded in the approved page chrome, with option panels driven by engine data, a summary, and lead capture that carries the configuration.

## Route and data

- `/configure/{model-slug}?trim={trim-slug}`; flag `page_configurator`, default off. Same host/brand resolution.
- Options (exterior colour, interior colour, wheels, interior themes) from `option_assignments`, scoped per trim, ordered, with vocabulary ids.
- The stream: a provider-agnostic session layer. The page asks the engine for a session (new edge function, e.g. `start-config-session`, authorised like the public capture functions: publishable key + origin + rate limit), gets an embed URL/token, and renders the provider iframe. No provider secrets ever reach the browser. Sessions are metered (start, end, duration) for cost tracking.

## Behaviour notes

- **Protocol:** page ↔ stream messages use the typed, versioned protocol (discriminated unions); unknown or mismatched messages are ignored and logged. Option changes are sent as commands; the stream's acknowledgements update the UI.
- **Fallback ("light" mode):** if the stream can't start (no capacity, slow network, provider down), show the static renders for the trim with the same option panels (no faked colours, same rule as the brochure) and a clear note. The page must never be a blank iframe.
- **Summary:** the chosen options, the trim's from-price, and the lead CTA. The lead carries a configuration snapshot (vocabulary ids only, no free text) so the brand sees exactly what was built.
- **Events:** option changes and session start/end feed the slice-9 event pipeline (consent rule B applies).

## PRs (at most 3, against `main`)

1. Session edge function + metering + ADR (provider-agnostic) + its tests; you deploy it.
2. The page: chrome, option panels from data, protocol wiring, fallback mode.
3. Summary + lead with configuration snapshot, events, motion, visual verification.

## Needs from the owner (Tier C)

- StreamPixel project/app credentials and which Unreal build/app to point at, stored as Supabase secrets.
- Confirmation of the per-session cost cap, if any.

## Acceptance

- [ ] Visual verification against the design (screenshots attached), including fallback mode.
- [ ] No provider secret in the browser bundle or network responses.
- [ ] Fallback mode appears when the session fails; the page is never blank.
- [ ] Lead includes the configuration snapshot; cross-tenant and isolation tests green.
