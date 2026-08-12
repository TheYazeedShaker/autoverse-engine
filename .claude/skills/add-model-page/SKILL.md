---
name: add-model-page
description: Scaffold a model detail page wired to the catalog and the configurator bridge.
---

1. Read the model + manifest from the catalog (source of truth on our side).
2. Render Autoverse-native controls from the manifest (colour/trim/lighting/view); NEVER hardcode options.
3. Use the Configurator Bridge to send commands (set_option, set_view, …) and ingest signals
   (state_applied, loading, error, canvas_interaction) — types in @autoverse/types.
4. Capture first-party events on every control + CTA interaction (add-analytics-event).
5. Optimistic UI: update the control instantly; show a spinner only if state_applied lags > ~150ms.
6. Honour the contrast rule and pull all styling from @autoverse/tokens.
