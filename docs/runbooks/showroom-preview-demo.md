# Runbook — see the showroom on a Vercel preview (the demo path)

Each showroom slice ships as a PR, and its Vercel preview link should show the page with the demo
brand's data. This runbook covers the one-time setup, and what to do per preview.

## How a preview address maps to a brand

A preview is served at a `*.vercel.app` address such as
`<project>-git-<branch>-<team>.vercel.app`, which names no brand. On **Preview deployments only**,
`SHOWROOM_PREVIEW_SUBDOMAIN` tells the page which brand-market to show:

- the host is not `<label>.<CONSUMER_ROOT_DOMAIN>`;
- the host is a single-label `*.vercel.app` name;
- and Vercel reports `VERCEL_ENV=preview`;
- → the page shows the brand-market whose `brand_markets.subdomain` equals
  `SHOWROOM_PREVIEW_SUBDOMAIN`, and logs `showroom_preview_mapping`.

The mapping never applies in production (`VERCEL_ENV=production`), and never to a non-vercel.app
host. It grants nothing extra: the page reads the same live, published data through
`showroom_catalog` that the brand's own address would, and the `page_showroom` flag still decides
(code: `apps/consumer/lib/showroom/host.ts`, `load.ts`).

## One-time setup

### 1. The demo brand seed

Use **`demo`** as the subdomain. For `showroom_catalog` to return it (ADR 0018), the seed must
have:

| Table           | Must be                                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `brands`        | `status = 'live'`                                                                                                                             |
| `brand_markets` | `market_code = 'EG'`, `currency = 'EGP'`, `live = true`, **`subdomain = 'demo'`** (lower case, one label)                                     |
| `models`        | `publish_state = 'published'`; `body_type`, `fuel`, `fuel_category`, `drive`, `transmission` are vocabulary keys (`suv`, `ev`, `awd`, …; #69) |
| `trims`         | `publish_state = 'published'`; `drive` null (inherit) or a drive key                                                                          |
| `trim_prices`   | `price_amount` for market `EG`, or `on_request = true`                                                                                        |
| `brand_themes`  | optional; one row for (demo brand, `EG`) gives the accent                                                                                     |
| `assets`        | optional until slice 2. An image shows only when `public_path` is set (a copy in the public bucket; ADR 0018)                                 |

A live market must not list `http://localhost` in `allowed_origins` (a database CHECK).

**Where the seed goes: decided (ADR 0019, time-limited).** For now Preview and Production share
**one database**, and the demo brand lives in production as a tenant, under these conditions:

- It is obviously synthetic: slug `demo`, name "Demo brand", and leads routed to the owner's inbox
  only.
- Its EG market goes **off live before `CONSUMER_ROOT_DOMAIN` is set in Production**.
- **Before the first real client brand goes live**, Preview moves to a separate non-production
  database (BACKLOG `PREVIEW-DB-SEPARATION`), and the demo tenant leaves production.
- Admin views and cross-brand analytics exclude or clearly label it when they are built.

Either way, **never point `SHOWROOM_PREVIEW_SUBDOMAIN` at a real brand**. Previews would mirror
that brand's catalogue on a `*.vercel.app` address. Keep Vercel deployment protection on for
Preview.

### 2. Vercel variables (the consumer project)

| Variable                     | Environments        | Value                                                                             |
| ---------------------------- | ------------------- | --------------------------------------------------------------------------------- |
| `SUPABASE_URL`               | Preview, Production | the project's API URL (one project for both, per ADR 0019)                        |
| `SUPABASE_ANON_KEY`          | Preview, Production | the project's **anon** (public) key. Never the service-role key                   |
| `SHOWROOM_PREVIEW_SUBDOMAIN` | **Preview only**    | `demo`                                                                            |
| `NEXT_PUBLIC_POSTHOG_KEY`    | Preview, Production | already set for flags. It must also be in **Preview**, or every flag is off there |
| `CONSUMER_ROOT_DOMAIN`       | Production (later)  | the consumer root domain, once one exists. Not needed for previews                |

The two Supabase variables are read server-side only (no `NEXT_PUBLIC_` prefix). After adding
them, redeploy the preview (env changes apply to new deployments only).

**Every variable the consumer reads is also declared in `apps/consumer/turbo.json`** (finding,
2026-09-26). The build runs through Turborepo in strict env mode, which filters out of the
**build process** any variable its task doesn't declare. For those variables Vercel only warns:
"set on your Vercel project, but missing from turbo.json … WILL NOT be available to your
application".

- **The filter covers the build.** The page's server code reads its variables at **runtime**, and
  Vercel functions get those from the project settings. So a missing declaration isn't necessarily
  why a page 404s. The log line in _Per preview_ below names the actual reason.
- `env`: read at **build** time, so part of the cache key.
  - `NEXT_PUBLIC_*` are inlined into the bundle. Turbo's Next.js inference would pass them anyway;
    they're declared explicitly so they stay in the cache key on purpose.
  - `ASSET_BASE_URL` is read in next.config from slice 2.
- `passThroughEnv`: read at **runtime** only. That means `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SHOWROOM_PREVIEW_SUBDOMAIN`, `CONSUMER_ROOT_DOMAIN`, `SENTRY_DSN`, and the Vercel system
  variables.
- `SHOWROOM_SOURCE` is deliberately **not** declared: a second layer behind `source.ts`, which
  refuses the local fixture on any deployment.
- `apps/consumer/turbo-env.test.ts` fails CI if the consumer, or a workspace package it bundles,
  reads a variable that isn't declared. Add a new variable to `turbo.json` in the same PR that first
  reads it.

### 3. The flag

Set `page_showroom` **on for distinct id `demo`**: active, with a release condition on the
distinct id equal to `demo` at 100%. The distinct id is the brand-market's subdomain (ADR 0017).
The flag is shared by all environments, so this also enables `demo.<CONSUMER_ROOT_DOMAIN>` in
production once a root domain exists. It only renders there if production's database holds a live
`demo` brand-market (see above). Turn the flag off (inactive) to take the page down; that takes
effect on the next request.

## Per preview

1. Open the PR's Vercel preview link **at its root path `/`**, for example
   `https://<project>-git-<branch>-<team>.vercel.app/`. The showroom is the app's home page. There
   is no market or language segment in the path: the market comes from the host (here, the preview
   mapping), and the EN/AR switch is part of the page. With Vercel deployment protection on, sign in
   to Vercel first.
2. You should see that slice's showroom for the demo brand.
3. A plain "Page not found" means one of the steps above is missing. In Vercel, open the preview
   deployment → **Logs**, and search for `showroom_not_found`. Its `reason` says which step:

   | `reason`              | Meaning and fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
   | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `host_unresolved`     | `SHOWROOM_PREVIEW_SUBDOMAIN` isn't set for Preview in Vercel (or wasn't when this deployment was built: redeploy after changing a variable), or the deployment isn't a preview. A `showroom_preview_mapping` line appears when the mapping works.                                                                                                                                                                                                                                                                                                                                |
   | `flag_off`            | The flag answered off for `demo`. Look for the `flag_eval_failed` line with the same `trace_id`: `reason: no_posthog_key` means `NEXT_PUBLIC_POSTHOG_KEY` wasn't there when this deployment was built (it's inlined at build, so redeploy); `timeout` or an error name means PostHog didn't answer. With no such line, PostHog itself said off. The page creates **no PostHog person** for `demo` (ADR 0017), so a condition on a stored _person property_ can never match. Use a condition on the distinct id, or, while only the demo brand exists, roll the flag out to 100%. |
   | `source_unconfigured` | `SUPABASE_URL` / `SUPABASE_ANON_KEY` aren't set for Preview in Vercel (or weren't when this deployment was built).                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
   | `unknown_subdomain`   | The database has no live brand in a live market with `subdomain = 'demo'`. Check the seed: brand status, market `live`, spelling.                                                                                                                                                                                                                                                                                                                                                                                                                                                |

   A **5xx** instead of a 404 means the catalogue read failed. Look for `showroom_source_error`: its
   `status` or `issues` field says why.

Catalogue reads are cached per server instance for at most 60 s, a "not found" answer included.
So a seed change, or a fix for `unknown_subdomain`, shows within a minute (ADR 0017).
