# Showroom: the showcase mapped into the Engine

The showcase (a separate private repo, `main` at `5039ce5`, 2026-11-20) is the base of the consumer showroom. Its configurator engine, brochure template and pages are **ported, not redesigned**. This page maps each part into `apps/consumer`, `packages/engine-core` and one proposed new package, and says what changes to meet the Engine's rules. Decisions are cited as **D*n*** ([`decisions.md`](decisions.md)).

## 1. The finding that shapes everything

**The showcase's four pages and two components are rebranded copies of the same Claude Design exports that sit in `design-approved/showroom/`.**

- The match:
  - the virtual showroom → `showroom`
  - the configurator → `configurator`
  - compare → `compare`
  - "trim details" → `brochure`
  - the tech drawer → `spec-drawer`
  - the vehicle card → `vehicle-card`
- Each pair has the same file and line counts within 3.
- So for those pages, "port, don't redesign" and rule A (the approved design wins) point the same way. The Engine has already built the showroom page from that design (slices 1–8, merged).

**The showcase also has three things the approved set doesn't:**

1. **A configurator engine**, which replaces the design's iframe.
2. **A scroll-scrubbed hero** (a frame sequence) on the showroom.
3. **A brochure template** (`/brochure-v3/<model>`, "contract 1"). This is a different, newer brochure design with a JSON data contract.

Each of these has a decision: D17 and D18 (the engine), D15 (the hero) and D16 (the brochure).

## 2. Part by part

| Part                     | Showcase today                                                                                                                                                                                                              | Engine today                                                                                                                    | Target                                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configurator engine      | `configurator/{engine,frames,interior,manifest}.js`, 2,326 lines, framework-free ES module. Exterior 360° from image sequences on canvas; interior panoramas in WebGL (Pannellum, lazy chunk); interactions; linked viewers | Protocol types only (`packages/types`)                                                                                          | New `packages/configurator` (client-only, strict TS) for the runtime; its pure parts in `engine-core` (D18)                                        |
| Embed                    | `/embed/<brand>/<model>`, `nmesis:*` postMessage protocol, 17 commands, 10 events                                                                                                                                           | none                                                                                                                            | `apps/consumer/app/embed/[brand]/[model]`, same URL, query and protocol (D19, D20)                                                                 |
| Configurator page        | `public/configurator.html` (986 lines) on the Claude Design runtime (React UMD): View / Build / Enhanced; Build steps Exterior → Interior → Checkout; price card; booking form                                              | Spec `PAGE-CONSUMER-CONFIGURATOR` (pixel-streaming session, not started)                                                        | `apps/consumer/app/configure/[model]` per the approved design. View and Build use the ported engine; Enhanced embeds the configurator server (D17) |
| Pricing and availability | `lib/pricing.js`, `lib/swatch.js` (138 lines, pure, shared by page and API)                                                                                                                                                 | `trim_prices`, on-request rule                                                                                                  | `engine-core` (pure TS), used by the page and by `capture-lead`                                                                                    |
| Compare                  | `public/compare.html` (703 lines): exactly 2 cars; two linked engine viewers; angled stills fade once the engine is ready; 7 spec categories; show differences; `?a=&b=&link=0`                                             | Tray + pair rule + `/compare` placeholder behind `page_compare`; spec `PAGE-CONSUMER-COMPARE`                                   | `apps/consumer/app/compare` per the approved design, with the showcase's viewers and linking. Data from the catalogue read path's ledger           |
| Brochure template (v3)   | `public/brochure-v3/` (render 650, behaviour 703, CSS 516, tokens 117) + `lib/configurator.js` (177); data in `data/brochures/` (brand file + model files); JSON Schema; client-rendered                                    | Spec `PAGE-CONSUMER-BROCHURE` (the approved brochure design)                                                                    | `apps/consumer/app/models/[model]`: the v3 template, server-rendered from Engine data, client islands for the viewers (D16, D23)                   |
| Brochure v1              | `public/brochure.html` (1,003 lines), the approved brochure design; linked from every other page                                                                                                                            | as above                                                                                                                        | Retired if D16 picks v3; otherwise it is the brochure                                                                                              |
| Showroom page            | `public/showroom.html` (730 lines): intro curtain, scrub hero, range with filters, cards, tech drawer, compare bar, footer                                                                                                  | `apps/consumer/app/page.tsx`, slices 1–8 merged: range, filters, cards, drawer, compare tray, lead modal, motion; carousel hero | **Keep the Engine page** (the same design, already in tokens, TS and EN/AR). Port only the scrub hero, as an optional per-brand hero (D15)         |
| Showcase admin           | `public/admin.html` + `api/admin/[action].js`: prices, option rules, swatches, stock, enhanced URL, coming soon, bookings                                                                                                   | none                                                                                                                            | Admin Catalog and Leads ([`admin-pages.md`](admin-pages.md) §B)                                                                                    |
| API                      | `api/catalog` (+ prices, availability), `api/bookings`, `api/gate`, `api/admin/*`, all server-side                                                                                                                          | `showroom_catalog` RPC (anon, ADR 0018), `capture-lead`, `ingest-event`                                                         | Catalogue → the RPC read path, extended. Bookings → `capture-lead` with the configuration snapshot. Gate → D21                                     |
| Data files               | `data/*-specs.json` (every figure with a source), dealer, clips, gallery, seed, brochures                                                                                                                                   | Engine tables                                                                                                                   | Imported into Engine tables (see [`data.md`](data.md) §5.1). The producer scripts stay as dev tooling                                              |
| Proof pages              | `public/proof/*`: the original brochure proof and its design-system page                                                                                                                                                    | none                                                                                                                            | Not ported. Archived in the showcase repo                                                                                                          |
| Build, dev, checks       | esbuild, a dev server that emulates the hosting rewrites, node:test (14 files), headless-Chrome scripts, PGlite SQL check                                                                                                   | Turbo, Vitest, Playwright planned, the merge wall                                                                               | The Next build replaces build and dev. Unit tests → Vitest. Browser checks → Playwright in CI                                                      |

## 3. What is ported as is, and what changes

The rules every part must meet:

- strict TS;
- tokens only (no hex or px outside `design-tokens`);
- EN and AR with RTL;
- Zod on every cross-boundary payload;
- server-side flags, default off;
- structured logs with one trace id;
- the performance budgets (production plan §15);
- reduced motion as a blocking gate.

### 3.1 Configurator engine → `packages/configurator` (D18)

**Ported as is:**

- the public API: `setModel`, `setTrim`, `setColour`, `setInterior`, `setScene`, `setView`, `setFrame`, `setDayNight`, `setPan`, `setZoom`, the interaction calls, `prefetchInterior`, `getState`, `destroy`;
- the event names, including the five undocumented ones (`prepared`, `loadall`, `backdrop`, `interior`, `zoom`);
- the progressive frame order;
- the shared bitmap cache with its memory budget;
- the worker decode pool;
- linked viewers (`link`/`unlink`);
- the input feel (8 px per frame, flick and coast);
- the manifest normaliser's tolerance.

**Changes:**

- **TypeScript, strict,** with a typed event map. The manifest is parsed with Zod, then normalised.
- **Client-only.** Loaded with `dynamic(..., { ssr: false })` after first paint. A heavy embed is excluded from the initial-load budget, as §15 allows.
- **No hard-coded brand.** The manifest URL comes from the brand-market's data (`models.asset_base_path`), not a build constant. The embed's `:brand` segment then selects the manifest, which today it doesn't.
- **Injected CSS** (hex and px in a JS string) → classes on token variables.
- **Strings** (aria labels, hints, control names, interaction names) → an options dictionary in EN and AR, supplied by the page.
- **Reduced motion** keeps its current behaviour (no inertia, no intro). The intro and fades move onto the motion tokens (ADR 0026); no raw durations remain.
- **Direction.** A drag stays physical in RTL (dragging right turns the car the same way), because the car is a physical object. ADR 0022's rule that side masters face right is unchanged.
- **CSP.** The page will need `worker-src blob:` and `img-src`/`connect-src` for the asset CDN; record this in the CSP note in ADR 0026.
- **Pannellum** stays as a lazy dependency (MIT). Its CSS loader is replaced by an import.
- **Observability.** The engine emits no analytics today. The page maps engine events to journey events (`config.option_changed`, `config.view_changed`, `config.interaction_played`) through the slice-9 pipeline (consent rule B), with per-kind payload schemas (BACKLOG #12).

### 3.2 Embed `/embed/<brand>/<model>` (D19, D20)

**Ported as is:**

- the path and the query (`trim`, `colour|color`, `interior`, `view`, `mode`, `controls`, `intro`, `frame`);
- the `nmesis:command` / `nmesis:result` / `nmesis:event` / `nmesis:hello` envelope;
- the 17 commands and 10 events;
- `frame-ancestors *` on this route only.

**Changes:**

- **Zod on both sides of the protocol**, with a contract test against a recorded fixture of today's messages (the merge wall's contract gate).
- **Errors** render as text.
- **Allowed hosts.** The embedding hosts allowed per brand come from `embed_hosts` ([`data.md`](data.md) §5.2), enforced by `frame-ancestors` per brand once the list is filled. `*` stays until then.
- **Protocol mapping.** The Engine's own `ConfiguratorCommand` (`packages/types`) is mapped onto these messages by an adapter, so the Engine has one typed protocol and the wire stays unchanged (D19).

**Link compatibility.** Iframe links that clients already use point at the **configurator server**, which stays where it is. Nothing in this port changes those. The showcase's own `/embed` was private, behind its password, and is the one this route carries over.

### 3.3 Configurator page (D17)

**Ported as is:**

- the approved design's layout and states;
- the three modes and the Build steps;
- the strict Build rules (not selectable, out of stock, `ensureValid`);
- paid-colour badges and the price line;
- the URL query (`model`, `trim`, `colour`, `interior`, `mode`, `step`, `view`, `kind`, `frame`) as `replaceState`.

**Changes:**

- **The Claude Design runtime is dropped.** The page is rebuilt in React/TSX from `packages/ui` primitives, matching the design. This is the same approach as the showroom.
  - The design's inline styles (167 hex, 386 px) are not copied; they become tokens.
  - Physical CSS → logical.
- **The route** is `/configure/[model]?trim=…` (spec). The showcase's `/configurator?model=…` redirects to it with the query kept (D20).
- **The catalogue** is not polled every 20 s from the browser. It is read server-side through the anon read path and revalidated by the cache rule in ADR 0017.
- **The booking form** becomes the shared lead modal (`packages/ui` LeadModal):
  - Turnstile, the consent text (ADR 0025) and `capture-lead`, with `submission_id` idempotency;
  - a **configuration snapshot** (vocabulary ids only, per the spec) and the server-recomputed price;
  - new lead types `reserve` and `interest` (D12).
  - Today's form has no consent checkbox. The consent wording is human only.
- **The Enhanced mode** iframes the configurator server URL from `models.enhanced_url`:
  - behind its own flag;
  - `sandbox` and `allow` attributes set;
  - never blank: the design's fallback shows the View mode.
- **Model-specific copy** in the page (`t.id === 'ev'` labels, one coming-soon model's name) is removed. It all comes from data.
- **Flags:** `page_configurator`, plus `configurator_enhanced` and `configurator_build_checkout`.

### 3.4 Compare

**Ported as is:**

- exactly 2 (already the Engine's pair rule, decided B);
- the two linked viewers with one shared Exterior/Interior switch and seat switch;
- `link=0` to unlink;
- the angled still that fades on the engine's `ready`;
- show differences;
- lazy viewers on intersection.

**Changes:**

- **URL.** The spec's URL is `?trims=a,b` (trim slugs). The showcase's `?a=&b=` with its legacy keys redirects (D20).
- **Data.** Rows come from the catalogue read path's resolved ledger, not the spec JSON file. Prices come from the catalogue, so admin edits reach compare (today they don't).
- **Tokens** (153 hex / 413 px in the source), EN and AR, RTL stacking per the design.

### 3.5 Brochure template and data contract (D16, D23)

**Ported as is:**

- the template's sections, in order:
  - pinned hero and exterior stage;
  - live 360° turn;
  - gallery;
  - performance sprint;
  - interior with seat switch and colours;
  - boot film;
  - highlights (clips only for features in the specs);
  - specs table;
  - trim comparison with two linked viewers;
  - close CTA;
  - section bar and menu;
  - footer;
- its rules:
  - the configurator manifest decides which trims and colours exist;
  - unknown values render "to be confirmed", never a typed number;
  - missing assets drop a section, never leave an empty box;
  - every asset belongs to its own model;
  - panorama switches never freeze;
- the copy tokens (`{trim.key}`, `{price:trim}`, `{count:trim:group}`, `{colour}`, `**bold**`, footnotes).

**Changes:**

- **The data contract moves into the Engine.** Facts and editorial each get their own home:
  - **Facts already in Engine tables come from them:** brand, markets, theme, logo, footer, socials, models, trims, prices, colours, the spec ledger and assets. The brochure no longer has its own copy.
  - **The editorial part becomes one versioned document per model and market**, validated by a Zod schema generated from today's JSON Schema. That part is: sections, copy, angles and crop boxes, highlight cards, interface strings and the CTA mode. This is the proposed `brochure_layouts` (D23).
  - Figures (`spec: "<trim>.<key>"`) resolve against the spec ledger's keys.
- **Rendering.** `render.js` builds pure strings, so it ports to server components. `brochure.js` becomes client islands for the scrub stage, the viewers and the films.
- **Arabic:**
  - Add Cairo and apply `brand.fonts` (declared but never applied today).
  - Convert 37 physical CSS properties to logical ones.
  - `strings` per locale.
  - Copy pairs EN/AR in the document.
- **Tokens.** The template's own `tokens.css` (colour roles, type scale, spacing, motion) is the closest thing to the Engine's system in the showcase. Map it onto `design-tokens` (the motion values onto ADR 0026's standard). The brand's colours come from `brand_themes` through the accent routing, never as raw hex.
- **Asset URLs.** Frame and boot-film URLs are read from the manifest, not from a fixed path pattern.
- **Route.** `/models/[model]?trim=` (spec), with `/brochure/<model>` and `/brochure-v3/<model>` redirecting (D20).

### 3.6 Showroom page (D15)

The Engine's page stays. From the showcase it gains:

- **The scrub hero**, as an alternative hero component, used when a brand-market has a hero sequence registered (a new asset kind, with ADR 0022 naming):
  - frames served from the CDN with content-hashed names, not from the app origin;
  - **never in the LCP path**: a poster first, frames after load, nothing under Save-Data or reduced motion;
  - the 8–26 MB per visitor that the showcase loads today is fetched only after first paint.
- **Model order and the hero's stop frames from data**, not code.

### 3.7 Data files and producers

- The spec file's sourced figures → the spec ledger, with each row's source in a new `spec_rows.source_ref`. The figures don't live in the brochure.
- Dealer data (showrooms, hours, contacts) → `brand_markets` presentation fields, plus a new `showrooms` table if the lead form keeps its showroom picker.
- Clips and gallery → `assets` (kinds `image`, `banner_video`, plus a new `feature_clip`).
- The producer scripts (`seed-sql`, `feature-clips`, `gallery`, `brochure-*`, `sample-swatches`, `measure-car`) are not app code. They move to `packages/asset-tools` as dev tooling next to the ADR 0022 tools, rewritten to emit Engine registration SQL.

### 3.8 Not ported

- `demo-site/` (source material);
- the standalone scrub folder;
- `public/proof/*`;
- React UMD and the Claude Design runtime;
- the unused 1280 motion tier;
- the showcase's own API protections, which are replaced by the Engine's capture path (`capture-lead`, its rate limits and Turnstile) and D21.

## 4. Budgets

Production plan §15 targets:

- LCP p75 mobile under 2.5 s;
- INP under 200 ms;
- CLS under 0.1;
- a fixed initial-JS ceiling per route;
- 60 fps, transform/opacity only;
- configurator control feedback immediate, never waiting on the iframe.

| Route                | What the showcase does today                                                           | The ported budget                                                                                                                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/` showroom         | React UMD + the design runtime + a 51–95 KB page; the scrub hero loads 8–26 MB         | Already governed by the Engine page. The scrub hero is a lazy island outside LCP                                                                                                                                                                          |
| `/configure/[model]` | Engine about 103 KB + an interior chunk; about 150 MB of decoded bitmaps at drawn size | Page chrome inside the route ceiling. The engine is lazy and excluded as a heavy embed. First frame shown from a poster before the engine loads. The memory budget is kept per device class (fixing the docs' stale 512/192/96 vs the code's 512/256/128) |
| `/compare`           | Two engines, created on intersection, with GPU pre-upload                              | As above; viewers are created only when visible                                                                                                                                                                                                           |
| `/models/[model]`    | Client-rendered from 4 JSON fetches; local clips up to 7.8 MB per model                | Server-rendered HTML (LCP from the hero poster). Clips are lazy, `playsinline`, muted, paused off-screen, none under reduced motion or Save-Data                                                                                                          |

**Owner.** The ceilings themselves (the KB per route) are an open item in D31: the plan names a "fixed ceiling per route" but no number.

**Caching.** Content-hashed, immutable asset names (ADR 0022) replace the showcase's unversioned immutable `/showcase/sequence/*`, which could pin a stale render for a year.

## 5. EN and AR

**The showcase is English-only:**

- `lang="en"` is hard-coded;
- `en-US`/`en-GB` number formats;
- Latin-subset fonts (Montserrat, Archivo);
- no Arabic string anywhere.

Only brochure v3 is i18n-ready: `lang` and `dir` come from data, and interface words come from `strings`.

**The port brings every page to the Engine's standard, as the showroom has it today:**

- copy dictionaries per page (`lib/*/copy.ts`);
- `Intl` with the page's numbering system;
- Cairo for Arabic;
- logical CSS;
- `dir` per portal;
- Arabic plurals through `Intl.PluralRules`;
- Arabic search folding where search exists.

**Owner and data:**

- Arabic model and trim names are required by the schema (`name_ar`), so the owner supplies them for the demo brand.
- Arabic copy for the brochure document comes from the owner or the translation step.

## 6. Order

The showroom work comes after the admin foundations ([`order.md`](order.md), track C):

1. the engine package and the embed;
2. the configurator page;
3. compare;
4. the brochure;
5. the scrub hero.

Showroom slices 9 (event capture) and 10 come first, because the dashboard depends on slice 9.
