# Build Spec — Engine Core 1·A

**Task ID:** `ENGINE-CORE-1A`
**Phase:** 1·A — engine spine
**Depends on:** Phase 0-H fully merged, Supabase check green on main.
**Blocks:** all app work, page build specs, configurator integration.
**Amended by:** `SPEC-engine-core-1A-REV-theming.md` (theming), `SPEC-engine-core-1A-REV2-hardening.md` (schema additions from design phase). Read all three before starting any slice.

---

## Goal

Build the engine's data layer and delivery infrastructure — the schema that every consumer, dashboard, and admin surface reads from, the pipelines that write to it, and the typed access layer the apps use. No app UI is built here; no pages. This is the substrate.

**Phase gate:** an event and a lead must each survive an induced failure (SIGKILL mid-write) and reconcile to zero loss. Nothing passes to 1·B until this gate closes.

---

## Slices (one PR each, in order)

### Slice 1 · Schema — catalog and markets

Migration `20260921_catalog.sql`:

- `brand_markets` (brand_id, market_code, currency, locale, rtl bool, consent_defaults jsonb, subdomain, live bool)
- `models` (brand_id, slug, names EN/AR, year, body_type, badge_label, fuel, fuel_category, drive, transmission, seats, accel, power, top_speed, efficiency_label EN/AR, efficiency_value, efficiency_icon_kind enum(pump|battery|range), torque, order_index, publish_state enum(draft|ready|published))
- `trims` (model_id, slug, names EN/AR, drive override, stats overrides, publish_state)
- `trim_prices` (trim_id, market_code, price_egp, on_request bool)
- RLS: authenticated reads on published rows; writes via service role only. Brand users read own brand only. Isolation test extended.

### Slice 2 · Schema — options and spec ledger

Migration `20260921_options_ledger.sql`:

- `vocabulary_registry` (id immutable-once-used, display EN/AR, kind, deprecated bool)
- `option_assignments` (model_id, all_trims bool, trim_ids[], kind, vocabulary_id, display EN/AR, swatch_hex, asset_ref, order_index)
- `spec_tabs` → `spec_groups` (+note EN/AR) → `spec_rows` (key EN/AR, scope enum(all_trims|per_trim), value_en, value_ar, trim_values jsonb)

### Slice 3 · Schema — control plane and billing

Migration `20260921_control_plane.sql`:

- `tier_modules` (tier_key, module_key, included bool)
- `subscriptions` (brand_id, tier_key, term_months, start/renewal dates, status, free_period_days, free_period_ends_at)
- `invoices` (brand_id, amount, currency, status enum(draft|sent|paid|overdue), issued_at, due_at, pdf_asset_ref)
- `brand_config` additions: whatsapp_number, lead_routing_emails[], lead_routing_webhook_url, footer_description EN/AR, footer_link_columns jsonb, social_links jsonb

### Slice 4 · Schema — content blocks and media

Migration `20260921_content.sql`:

- `content_blocks` (model_id, order_index, kind enum(chapter|feature|highlight), kicker/headline/body EN/AR, image_asset_ref, layout_variant, publish_state)
- `banner_video` (model_id, trim_id nullable, asset_ref, poster_asset_ref)
- Asset kind enum extended: `sequence_video | banner_video | per_color_render`; per-color renders keyed on (model_version_id, trim_id, vocabulary_id, view_key)

### Slice 5 · Schema — leads and events

Migration `20260921_leads_events.sql`:

- `leads` (brand_id, market_code, full_name, phone, city, model_id, trim_id, preferred_time, type enum(test_drive|quote|contact|whatsapp), status, score, score_breakdown jsonb, consent_text_version, consent_at, session_id)
- `lead_activities` (lead_id, actor_id, kind enum(status_change|contact_attempt|note|score_update), payload jsonb, created_at — append-only)
- `events` (id, session_id, brand_id, market_code, model_id, trim_id, kind, payload jsonb, received_at, processed_at — write-once)
- DLQ tables: `event_dlq`, `lead_dlq` — source schema + error, attempts, last_attempted_at. Any entry = incident.

### Slice 6 · Data-access layer

`packages/engine-core` typed repositories: `BrandRepository`, `ModelRepository`, `TrimRepository`, `LeadRepository`, `EventRepository`. Every method typed against generated Supabase types; brand_id enforced at repository level. Ledger helpers: `resolveLedgerRow(rowId, trimId)` and `rowDiffers(rowId)`.

### Slice 7 · Event pipeline

Edge function `ingest-event`: validates against discriminated-union EventSchema, idempotent upsert on id, enqueues downstream jobs. On failure: writes to `event_dlq`, returns 202 (never 5xx). Retry worker: polls dlq, replays, dead-letters after 5 attempts.

### Slice 8 · Leads pipeline

Edge function `capture-lead`: consent field hard-required (reject if absent, log rejection). Writes lead + consent + first lead_activity in one transaction. Enqueues routing notification. On failure: writes to `lead_dlq`. Webhook delivery = separate job with own retry/DLQ.

### Slice 9 · Job queue

`jobs` table (kind, payload jsonb, status, attempts, run_after). Job worker dispatches by kind. In-scope kinds: `notify-lead-email`, `deliver-lead-webhook`, `retry-event-dlq`, `retry-lead-dlq`. All idempotent.

---

## Phase gate (closes 1·A)

SIGKILL ingest-event mid-write:

- [ ] Event appears in `event_dlq`
- [ ] Retry worker replays → lands in `events` → dlq empty
- [ ] Repeat for leads pipeline
- [ ] Both reconcile to zero loss
      Evidence posted to Slack.

---

## Standards

- TypeScript strict in `packages/engine-core`.
- No hardcoded brand_ids, market codes, tier keys — all parameterised.
- Every new table added to the isolation test.
- RLS: brand users read-only; writes via service role only (0-H corrected template).
- `PROGRESS.md` current at session end.
