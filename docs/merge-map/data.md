# Data: one database

How the three data estates become one Supabase project, table by table, and how the live data moves without downtime.

**Sources read:**

- Engine `main` at `8dbd10a`: 27 migrations, from `20260617132328_init_tenancy` to `20260928140000_consent_texts_and_capture_key`.
- Nmesis admin `main` at `d23d313` (2026-11-19): `supabase/migrations/0001`–`0012`, `backend/*.js` and the JSON stores in `backend/data/`.
- Showcase `main` at `5039ce5` (2026-11-20): `supabase/0001`–`0003`, `api/` and `data/`.

**Limits.** Row counts are estimates from code and migration comments. Nothing here was read from a hosted database, because the guard blocks hosted reads. Decisions are cited as **D*n***, from [`decisions.md`](decisions.md).

## 1. Today

| Estate                   | Where                                                                                                                             | What it holds                                                                                                                                                                                                                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Engine project**       | Schemas `public` and `app_auth`                                                                                                   | 29 tables (28 in `public`, 1 in `app_auth`). Demo tenant only (ADR 0019). RLS on every table. Reads go by role. Writes go through edge functions, or through gated SECURITY DEFINER functions for public capture (ADR 0013). Fully described by migrations.                                                          |
| **Nmesis project**       | Schemas `accounts`, `ops`, `analytics` and `brochures`; the showcase's `catalog`; `auth` (staff, AI Studio members, TOTP); `cron` | **Live data:** configurator visitor events (hundreds of thousands to millions of rows); leads and bookings with PII; invoices and payments (gapless numbers, never deleted); staff accounts with mandatory TOTP. RLS is on everywhere with **no policies**: everything goes through PostgREST with the service role. |
| **Outside any database** | Nmesis repo, data branch: `backend/data/`                                                                                         | **The canonical catalogue:** `brands.json` (8 brands, 29 models) and one configurator config per car (`colors`, `grades` = trims with prices, `interiors`, `lightings`, `interactions`, `dayNight`). The configurator server reads these.                                                                            |
| **Outside any database** | Showcase repo: `data/`                                                                                                            | The demo brand's spec file (every figure with its source), dealer file, feature clips, gallery and brochure files (contract 1).                                                                                                                                                                                      |

The admin, the showcase and the AI Studio (a separate Nmesis product) **already share the Nmesis project**. "One Supabase" therefore means bringing the Engine into it.

## 2. Which project (D1)

**Recommendation: the Nmesis project becomes the one production database. The Engine's current project becomes Preview.**

- **Live data and accounts stay where they are.** No staff password, TOTP factor or session moves. The configurator server's writes never change host, so client iframes see no change.
- **The Engine's side is all schema.** Its 27 migrations apply to the Nmesis project as they are. Its only data is the demo tenant, which belongs in Preview anyway (ADR 0019 condition 3, BACKLOG #13).
- **No names collide.** The Engine uses `public` and `app_auth`. The Nmesis project keeps `public` deliberately empty apart from a legacy `public.shared_configs` that no Engine table shares a name with.
- **What changes for the owner:** the Supabase GitHub integration, the edge-function secrets, the Vault entries for the job worker and the Vercel env vars all point at the Nmesis project (owner steps H1–H4 in [`order.md`](order.md)). `pg_net` must be enabled there; `pg_cron` already is.

## 3. Target layout (D2)

**Recommendation: adopt the four Nmesis schemas in place, under Engine migrations. Fold the catalogue into the Engine's `public`.**

| Schema      | After the merge                                       | Holds                                                                                                                                                                                  |
| ----------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public`    | Engine (unchanged), plus the new tables in §5         | Tenancy, catalogue, content, theming, leads, events, jobs, keys, consent                                                                                                               |
| `app_auth`  | Engine (unchanged)                                    | RLS helpers, rate limits                                                                                                                                                               |
| `accounts`  | **Adopted**: the Engine's commercial schema (D13)     | Organisations and their brands, plans and features, subscriptions, invoices, payments, costs, FX. Also AI Studio members and its usage ledger (D30)                                    |
| `ops`       | **Adopted**                                           | Audit log (D9), alerts and recipients, anomalies, health checks, configurator online/paused state, frame keys, share links, settings and cost caches; `ops.leads` frozen after cutover |
| `analytics` | **Adopted**, still written by the configurator server | Configurator raw events and daily rollups (D24)                                                                                                                                        |
| `brochures` | **Adopted**, then retired into `public` (D23)         | The Nmesis brochure tool's documents                                                                                                                                                   |
| `catalog`   | **Retired** into `public`                             | The showcase catalogue and bookings                                                                                                                                                    |

**"Adopted" means:**

- **The baseline migration.** The schema's DDL enters `supabase/migrations/` as a baseline migration.
  - It is generated from a **schema-only dump of the live project** that the owner runs, not from the Nmesis repo's migration files, which may have drifted.
  - Every statement is guarded:
    - tables and indexes use `if not exists`;
    - policies and types go in `do` blocks that check the catalogue;
    - no `create or replace` touches a live function or view unless its body is identical.
  - A drift check in the PR compares the dump with the result. The baseline is then a no-op on the Nmesis project and builds the schema from scratch everywhere else (CI, Preview).
- **One owner of the schema.** From then on, the Engine repo is the only place its schema changes.
- **What the baseline adds:** staff-read RLS policies (no brand column is needed for those) and a paired isolation test per table.
- **What comes later:**
  - `brand_uuid` columns (FK to `public.brands`, nullable until backfilled) arrive with the crosswalk in DB-5;
  - brand-read policies arrive only with the dashboard (E1).
  - Until a row's `brand_uuid` is set, the isolation tests treat it as staff-only. This exception to "`brand_id` not null on every brand-scoped table" is recorded in the one-database ADR and ends at the contract step.
- **Writes stay server-side**, as today. No table DML is granted to `authenticated` (D8).

**Why not copy everything into `public`?**

- It would move millions of event rows and every PII row for no functional gain.
- It would also break the configurator server and the AI Studio, which read and write these schemas today.

### Four rules the baseline applies before any role is granted `usage` on an adopted schema

- **Staff means aal2.** `app_auth.is_autoverse_staff()` and every staff helper also require `auth.jwt()->>'aal' = 'aal2'`, so a password-only token never passes a staff policy, whatever the route checks. A test proves an aal1 staff token is refused on every adopted table.
- **Function grants.** EXECUTE on every SECURITY DEFINER function in the schema is revoked from PUBLIC and granted only to the roles that need it. A test proves `authenticated` is refused.
- **Views over `auth.users`** (`accounts.people`) stay service-role only.
- **Explicit grants per table** replace schema-wide default privileges, so a new table never inherits more than its migration states.

## 4. The ID crosswalk (D25)

**The two estates key things differently.**

- **Nmesis** keys every brand and car by **text slugs**: `brand_id` and `model_id` from `brands.json`. There is no foreign key anywhere.
  - `ops.frame_keys` uses columns named `brand` and `model`.
  - `ops.cdn_daily` uses S3 folder prefixes.
  - Trims, colours and interiors exist only inside the per-car config JSON, as ids like `Black_&_Brown`.
- **The showcase** uses its own kebab ids. 2 of its 3 models match Nmesis slugs.
- **The Engine** keys everything by uuid, with a `slug` per brand and model.

**One new table makes them meet: `public.legacy_ids`.** Its columns: `(system, kind, legacy_key, brand_id, model_id, trim_id, vocabulary_id)`.

- `system` is `nmesis | showcase`.
- `kind` is `brand | model | trim | colour | interior | cdn_prefix`.

**Rules:**

- **Engine slugs start equal to the Nmesis slugs** wherever they are valid (`^[a-z0-9][a-z0-9-]*$`). The crosswalk then mostly maps a slug to itself.
- **Frame keys are never re-keyed.** `ops.frame_keys` rows only unwrap with the exact original brand, model and version strings, so those stay as they are and are resolved through the crosswalk.
- **Option ids** that don't fit the vocabulary format get a vocabulary id plus a crosswalk row. The configurator server keeps its own ids in the files it reads (D3).

## 5. Table by table

**How to read the Action column:**

- **merge**: rows move into an existing Engine table.
- **adopt**: the table stays where it is, under Engine migrations.
- **new**: a new Engine table or column.
- **rename**: the table keeps its data under a new name.
- **freeze**: the table becomes read-only after cutover and is kept for history.
- **drop**: removed after the stated condition.
- **keep**: left as it is.

### 5.1 Showcase `catalog` → Engine `public`

| Showcase table | Rows | Engine target                                                                                                                                           | Action      | Notes                                                                                                                                                                                                                                                                                       |
| -------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `markets`      | 1    | `brand_markets`                                                                                                                                         | merge       | The demo brand's AE market: currency, locale and `rtl` from the Engine's columns; a subdomain                                                                                                                                                                                               |
| `models`       | 3    | `models`                                                                                                                                                | merge       | `name` → `name_en`. **`name_ar` is required and missing**, so the owner supplies it. `status` (on_sale / coming_soon / hidden) → `publish_state` plus a new `models.sale_status` (on_sale / coming_soon)                                                                                    |
| `trims`        | 6    | `trims`                                                                                                                                                 | merge       | `powertrain` → the existing `fuel`/`drive` vocabulary kinds; fuel per trim is the one missing column (D26)                                                                                                                                                                                  |
| `options`      | 22   | `vocabulary_registry` + `option_assignments`                                                                                                            | merge       | Kinds exterior_colour → `exterior_color`, interior → `interior_color`. **`package` has no Engine kind**, so it is a new enum value, and the `option_assignments_kind_is_option` CHECK is widened with it. `swatch` (one or two hex) → `swatch_hex` plus a new `swatch_hex_2`                |
| `option_rules` | 41   | `option_assignments` (scope) + new `option_assignments.selectable`, `unavailable_reason_en/ar`                                                          | merge + new | "Not selectable" stays admin-editable (the Build page's strict mode)                                                                                                                                                                                                                        |
| `prices`       | —    | `trim_prices` (trim rows); new `option_prices` (option rows); new `price_history` (every change)                                                        | merge + new | Today it is insert-only history; the Engine keeps one current row per trim and market (D26)                                                                                                                                                                                                 |
| `stock`        | 62   | new `public.stock` `(brand_id, market_code, trim_id, exterior_id, interior_id, quantity, status)`                                                       | new         | **Every row is demo data (`is_demo`)**, so nothing migrates. The table starts empty                                                                                                                                                                                                         |
| `settings`     | ≤3   | `models.enhanced_url` (new; an https link to the configurator server) and `models.sale_status`                                                          | new         | The seed's URLs are null                                                                                                                                                                                                                                                                    |
| `bookings`     | low  | `leads` + new `leads.email`, `leads.configuration` (jsonb, vocabulary ids only), new `lead_type` values `reserve` and `interest`, new `leads.reference` | freeze      | **No consent record exists on these rows**, and the Engine requires `consent_text_version`. D22 = B (interim, pending legal): they stay in `catalog.bookings`, frozen, staff-read through the legacy view; nothing migrates. New bookings go to `public.leads` through `capture-lead` (C4a) |

### 5.2 Nmesis catalogue files → Engine `public`

| Source                                                                                    | Engine target                                                                                                                      | Action | Notes                                                                                                                                     |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `brands.json`: brands                                                                     | `brands` + one `brand_markets` row per market                                                                                      | merge  | 8 brands. Markets aren't recorded in the file, so the owner supplies them                                                                 |
| `brands.json`: models                                                                     | `models` (+ `legacy_ids`); `carBaseUrl` → new `models.asset_base_path`; `hasInteraction` → derived from config                     | merge  | 29 models. `name_ar` comes from the config's `labelAr` where present                                                                      |
| `configs/<brand>/<model>.json`: `grades`                                                  | `trims` + `trim_prices` (the grade's `price`)                                                                                      | merge  | Price currency follows the market (#67 rule)                                                                                              |
| `configs/…`: `colors`, `interiors`                                                        | `vocabulary_registry` + `option_assignments` (`trim_ids` from `grades[].colorIds/interiorIds`)                                     | merge  | Ids → vocabulary ids through `legacy_ids`                                                                                                 |
| `configs/…`: `lightings`, `interactions`, `dayNight`, `ui`, frames                        | new `public.configurator_configs (brand_id, model_id, version, document jsonb, published_at)`, composite FK `(model_id, brand_id)` | new    | The configurator server's own document, Zod-validated, versioned. The Engine publishes it back in today's file format (D3)                |
| `configs/…-registry`, `-exterior-manifest`, `-interaction-manifest`, `-daynight-manifest` | `model_versions` + `assets` (ADR 0022 naming for new uploads)                                                                      | merge  | The manifest is the source of truth per model (`CLAUDE.md` boundary). Existing frame paths are registered as they are; no file is renamed |
| `known-hosts.json`, `blocked-sites.json`                                                  | new `public.embed_hosts (brand_id, host, state allowed / blocked)`                                                                 | new    | Both are empty today                                                                                                                      |
| `assets-tree.json`                                                                        | none                                                                                                                               | drop   | An S3 listing cache, rebuilt on demand                                                                                                    |
| `deleted.json` (30-day recycle bin)                                                       | new `ops.recently_deleted`, or soft-delete columns                                                                                 | new    | D8                                                                                                                                        |

### 5.3 `accounts` (adopted; the commercial model, D13)

| Table                                                         | Rows                    | Action                                  | Engine link and notes                                                                                                                                                                                       |
| ------------------------------------------------------------- | ----------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `organisations`                                               | handful                 | adopt                                   | The commercial tenant. A brand belongs to one organisation                                                                                                                                                  |
| `organisation_brands`                                         | ≤8                      | adopt + new column                      | `brand_uuid` FK to `public.brands` arrives with every other `brand_uuid` in DB-5 (backfilled from `legacy_ids`); keep `brand_id` text until every reader has moved                                          |
| `products`, `features`, `plans`, `plan_features`, `overrides` | 6 / 41 / 3+ / 123 / few | adopt                                   | The plan and feature model the dashboard gates on (replaces `public.tier_modules`, D13)                                                                                                                     |
| `price_book`                                                  | ~19                     | adopt                                   | **Holds bank details and the company tax id.** Finance role read only; never brand-readable                                                                                                                 |
| `subscriptions`, `subscription_items`                         | small                   | adopt                                   | Replace the Engine's empty `public.subscriptions` (dropped in the contract step)                                                                                                                            |
| `invoices`, `invoice_lines`, `payments`, `invoice_counters`   | small, growing          | adopt                                   | **Gapless numbers; invoices and payments are never deleted**, enforced by triggers that the baseline keeps. Replace the Engine's empty `public.invoices`. Brand-readable through a view (dashboard Billing) |
| `cost_entries`, `fx_rates`, `credit_packs`                    | small                   | adopt                                   | Finance only                                                                                                                                                                                                |
| `usage_ledger`                                                | growing                 | adopt, append-only                      | Written only by the AI Studio (D30)                                                                                                                                                                         |
| `members`                                                     | small                   | adopt                                   | AI Studio seats. Separate from brand-dashboard users (`public.profiles.brand_role`)                                                                                                                         |
| `staff`                                                       | ≤10                     | merge → `public.profiles.platform_role` | The role mapping is in D7. `staff` becomes a view over `profiles` until the Nmesis admin is switched off, then is dropped                                                                                   |
| `invitations`                                                 | small                   | adopt                                   | Staff and member invites. **Stores token hashes only**                                                                                                                                                      |
| `cars`                                                        | ~29                     | drop (after cutover)                    | A mirror of `brands.json` for other products. Becomes a view over `public.models` (`configurator_url` from `legacy_ids`) so the AI Studio keeps reading it                                                  |
| `configurator_access`                                         | small                   | adopt                                   | The AI Studio's per-organisation car list                                                                                                                                                                   |
| view `people`                                                 | —                       | keep (service role only)                | Exposes `auth.users` emails                                                                                                                                                                                 |

### 5.4 `ops` (adopted)

| Table                                                            | Kind and volume                     | Action                                                               | Notes                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit_log`                                                      | append, thousands                   | adopt + new columns                                                  | **Becomes the one audit table (D9).** Add `actor_id uuid`, `entity_type`, `entity_id`, `before jsonb`, `after jsonb`, `trace_id`. Make it append-only with a trigger. Written by DB triggers on every audited table                                                                                                                                                                                                     |
| `leads`                                                          | PII, tens to hundreds per month     | keep, then freeze (D22 = B, interim)                                 | **Not migrated: consent gap as for bookings.** Staff read it through the legacy view. The configurator server keeps writing here until its lead form posts to `capture-lead` with a consent text, and then the table freezes. If legal later allows migration, the mapping is: `kind` test_drive → `test_drive`, build_price → `quote` (D12); `email` → `leads.email`; `preferred_date` → the existing `preferred_time` |
| `shared_configs`                                                 | visitor-created, moderate           | adopt                                                                | The configurator server's `/c/:id` links. They must keep working, so the table stays, read and written by that server. Add `brand_uuid`                                                                                                                                                                                                                                                                                 |
| `model_state`                                                    | ≤29, changes what visitors see      | adopt (rename later)                                                 | Configurator online/paused per car. Admin writes it; the configurator server reads it every 60 s                                                                                                                                                                                                                                                                                                                        |
| `frame_keys`                                                     | **secret ciphertext**               | keep (configurator server only)                                      | Never readable by any staff role through PostgREST. Only the server that unwraps (holding `FRAME_MASTER_KEY`) touches it                                                                                                                                                                                                                                                                                                |
| `alerts`, `alert_sends`, `alert_recipients`, `alert_email_pause` | small                               | adopt                                                                | `alert_recipients` holds emails (PII). Admin "Alerts" and System settings                                                                                                                                                                                                                                                                                                                                               |
| `anomalies`, `anomaly_dismissals`                                | small                               | adopt                                                                |                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `health_checks`                                                  | ~8.4k/day, 120-day prune, **no PK** | adopt + add PK                                                       | Written every 5 minutes by the picture checker, which stays on the configurator server (D4)                                                                                                                                                                                                                                                                                                                             |
| `traffic_hourly`                                                 | ~9.6k                               | adopt                                                                | The configurator server's own request stats                                                                                                                                                                                                                                                                                                                                                                             |
| `settings`                                                       | <10                                 | adopt                                                                | Key `fixed_costs` is legacy, so drop it                                                                                                                                                                                                                                                                                                                                                                                 |
| `ai_usage`                                                       | small                               | adopt                                                                | Token counts only                                                                                                                                                                                                                                                                                                                                                                                                       |
| `clients`                                                        | ≤8, contact PII                     | merge → `accounts.organisations` contacts, or `brand_market_private` | Contact name and email per brand, plus the monthly-report opt-in                                                                                                                                                                                                                                                                                                                                                        |
| `cdn_daily`, `cdn_log_cursor`                                    | derived; cursor grows               | adopt                                                                | Keyed by S3 prefix, resolved to a model through `legacy_ids`                                                                                                                                                                                                                                                                                                                                                            |
| view `uptime_30d`                                                | —                                   | adopt                                                                |                                                                                                                                                                                                                                                                                                                                                                                                                         |

### 5.5 `analytics` (adopted; D24)

| Table                                                                                                  | Kind                                   | Action                    | Notes                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `events`                                                                                               | raw, **highest volume**, 400-day prune | adopt; read through views | Written by the configurator server. Pseudonymous: a per-load session id, coarse geography, no IP. Never copied into `public.events`. The admin and dashboard read rollups, not raw rows                                              |
| `daily_model_stats`                                                                                    | derived, never pruned                  | adopt                     | What the admin's Overview reads today. Add `brand_uuid` and `model_uuid` (generated from `legacy_ids` by the rollup). **Days are UTC while every other report uses Cairo time**: fix that before the dashboard shows it, or label it |
| RPCs `period_totals`, `hourly_opens`, `weekday_hour_opens`, `brand_daily`, `rollup_day`, `cleanup_old` | —                                      | adopt                     | Granted to staff roles through wrapper functions that check the role; never to `anon`                                                                                                                                                |

**Engine raw events and configurator events stay in two tables at first.** The Engine's `public.events` holds the consumer page journeys (showroom slice 9). The configurator's events stay in `analytics.events`. The dashboard's funnel reads both through one rollup view keyed by `brand_uuid`. Convergence (the configurator server sending to `ingest-event`) is a later step, after the merge.

### 5.6 `brochures` (D23)

| Table             | Rows   | Action                                                                                   |
| ----------------- | ------ | ---------------------------------------------------------------------------------------- |
| `brands`          | 8      | adopt, then merge into the brochure data model chosen in D23                             |
| `templates`       | small  | adopt, then merge                                                                        |
| `model_content`   | ≤29    | adopt, then merge; keep the published snapshots as they are, so public pages never break |
| `publish_history` | append | adopt; keep forever                                                                      |

### 5.7 Engine tables affected by the merge

| Engine table                                                                                        | Change                                                                                                                            |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`                                                                                          | Gains every Nmesis staff account (D6, D7). `platform_role` enum changes per D7                                                    |
| `leads`                                                                                             | New `email`, `reference`, `configuration`, `source` (`preferred_time` already exists); new `lead_type` values; status set per D12 |
| `models`                                                                                            | New `sale_status`, `enhanced_url`, `asset_base_path`                                                                              |
| `option_assignments`                                                                                | New `selectable`, `unavailable_reason_en/ar`, `swatch_hex_2`; `option_kind` gains `package`                                       |
| `subscriptions`, `invoices`, `tier_modules`                                                         | **Dropped** (contract step) once `accounts` serves Brands → Billing and the dashboard gates. They hold no real data               |
| `brands`                                                                                            | `tier` and `billing_state` become derived from `accounts` (view or trigger), so there is one commercial truth                     |
| new: `legacy_ids`, `configurator_configs`, `option_prices`, `price_history`, `stock`, `embed_hosts` | Above                                                                                                                             |

## 6. Moving the data without downtime

**The method: expand → backfill → dual-read → switch writes → freeze → contract.**

- Every step is its own migration, merged by the owner before the next.
- No step takes a table lock longer than an index build `concurrently`.
- No public URL changes host.

| Step | What                                                                                                                                                                                                                                                                                                                                  | Downtime                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 0    | **Repoint.** The Engine's migrations are applied to the Nmesis project by the Supabase integration (owner). This creates empty `public` tables; nothing existing is touched. The Engine's current project becomes Preview and keeps the demo tenant                                                                                   | none                                      |
| 1    | **Baseline.** The adopted schemas' DDL enters the repo as a guarded migration generated from the live schema (§3), with the four rules and the staff-read policies. Isolation tests cover the adopted tables                                                                                                                          | none (no-op DDL plus grants)              |
| 2    | **Expand.** New tables and columns (§5.7); `legacy_ids`; `brand_uuid` columns, nullable                                                                                                                                                                                                                                               | none                                      |
| 3    | **Backfill.** A one-off, idempotent job reads `brands.json` and the configs (data branch) and `catalog.*`, then writes Engine rows and `legacy_ids`. It runs again until a diff report is empty                                                                                                                                       | none                                      |
| 4    | **Dual-read.** Each Engine admin page ships behind its flag and reads the new tables. **The Nmesis page is still the writer**, and a sync job copies its writes into the Engine tables every minute, keyed on `legacy_ids`. Staff compare both pages                                                                                  | none                                      |
| 5    | **Switch writes (per page).** The Engine page becomes the writer. The Nmesis page goes **read-only** (its API refuses writes for that area) and links to the Engine page. For the catalogue, a publish job writes the configurator server's JSON from Engine tables in today's format (D3), so the configurator server sees no change | none (one page at a time, see `order.md`) |
| 6    | **Freeze.** After a hold period with no reads from the Nmesis side (logged), its tables for that area become read-only: `ops.leads` and `catalog.*` are frozen; `accounts.staff` is a view                                                                                                                                            | none                                      |
| 7    | **Contract.** Drop the Engine's empty duplicates (`public.subscriptions`, `public.invoices`, `public.tier_modules`) and the retired `catalog` schema. Make `brand_uuid` columns `not null` once backfilled, then drop the text keys nobody reads. Each drop is its own PR after a pre-check query returns 0 rows                      | none                                      |

**What never moves:** `analytics.events`, `ops.shared_configs`, `ops.frame_keys` and `ops.model_state`. The configurator server owns their writes, and it stays where it is.

## 7. Migration order (database PRs first, each merged by the owner before anything that needs it)

These are the database PRs in [`order.md`](order.md). Each one ships with its paired isolation test and a hosted pre-check query where a constraint could fail on live rows.

1. **DB-1 Baseline** (A1).
   - It needs the repoint first: the Engine migrations go to the Nmesis project (owner steps H1–H4).
   - The baseline migration for `accounts`, `ops`, `analytics` and `brochures`, with the four rules in §3 and staff-read policies.
   - Isolation tests for every adopted table.
2. **DB-2 Staff identity and audit** (A2).
   - `platform_role` per D7.
   - `profiles` rows for every active `accounts.staff` row (same `auth.users` ids; one SQL the owner runs).
   - `accounts.staff` becomes a compatibility view.
   - `audit_log` extended and made append-only.
   - Generic audit triggers (D9).
   - Every staff helper requires aal2 (D6).
3. **DB-2b The staff write pattern** (A4a): role-, area- and aal2-checked RPC helpers; no table DML for `authenticated`; soft-delete columns; the purge rule that archives anything with leads or invoices (D8).
4. **DB-3 Read wrappers** (A5): role-checked wrappers over the `analytics` and `ops` RPCs.
5. **DB-4 Leads expand** (A8).
   - New columns and enum values (D12).
   - A staff-only legacy view over `ops.leads` and `catalog.bookings`, labelled as having no consent record. Nothing is migrated (D22 = B, interim).
   - Folds in BACKLOG #17: the stale `LeadType` in `packages/types`.
6. **DB-5 Crosswalk and catalogue expand** (A10):
   - `legacy_ids`;
   - every nullable `brand_uuid` column on the adopted tables, `organisation_brands` included;
   - the new catalogue columns and tables (§5.7);
   - `configurator_configs` and `embed_hosts`;
   - the catalogue write RPCs.
7. **DB-6 Commercial link** (A15).
   - Staff-role wrappers for the finance RPCs.
   - The commercial write RPCs, each declaring its area.
   - The brand-readable views over invoices and subscriptions come later, with the dashboard's E1.
8. **DB-7 Brochure model** (A24, D23).
9. **DB-8 Contract** (A28+), one PR per drop, after each area's switch-off in `order.md`.

Showroom slice 9's database PR (B1) runs alongside, independent of these.

## 8. Risks

| Risk                                                                                                                         | Mitigation                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A key change during the merge could sign out staff or break links already sent (invoices, unsubscribes)                      | The owner pins the session and signed-link secrets on the Nmesis host before DB-1 (H1; exact steps given privately). No key is rotated during the merge                                                       |
| Granting schema usage to staff roles widens what they can call                                                               | DB-1 applies the four rules in §3 before any grant; a test calls each function as `authenticated` (aal1 and aal2) and expects a refusal                                                                       |
| Leads and bookings carry no consent record, while the Engine requires one                                                    | D22 = B, interim until legal confirms: frozen where they are, staff-read only, nothing deleted. The configurator server's form must move to `capture-lead` with a consent text, so that no new rows join them |
| Rollup days are UTC while reports use Cairo time                                                                             | Fix it in the rollup before the dashboard shows daily figures, or label the axis UTC                                                                                                                          |
| `daily_model_stats` uses NULL for "not recorded", which is not 0                                                             | Engine readers keep NULL distinct from 0, with a unit test                                                                                                                                                    |
| Gapless invoice numbers and never-delete rules                                                                               | The baseline keeps the triggers; an Engine test proves a delete and a gap are refused                                                                                                                         |
| The AI Studio reads and writes `accounts` and owns objects that no repo shows (for example `accounts.studio_support_access`) | The baseline never drops or alters an object it doesn't declare. The owner lists the Studio's objects before DB-1 (D30)                                                                                       |
| `public.shared_configs` (legacy) has old share links that were never copied                                                  | Left alone. If old `/c/` links matter, a one-off copy into `ops.shared_configs` is a separate PR                                                                                                              |
| The showcase's live swatch values may differ from its seed (reported to the owner separately)                                | The catalogue backfill takes swatches from the seed until the owner confirms the live values                                                                                                                  |
