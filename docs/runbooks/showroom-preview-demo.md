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

### 3. The flag

Set `page_showroom` **on for distinct id `demo`**: active, with a release condition on the
distinct id equal to `demo` at 100%. The distinct id is the brand-market's subdomain (ADR 0017).
The flag is shared by all environments, so this also enables `demo.<CONSUMER_ROOT_DOMAIN>` in
production once a root domain exists. It only renders there if production's database holds a live
`demo` brand-market (see above). Turn the flag off (inactive) to take the page down; that takes
effect on the next request.

## Per preview

1. Open the PR's Vercel preview link. With Vercel deployment protection on, sign in to Vercel
   first.
2. You should see that slice's showroom for the demo brand.
3. A plain "Page not found" means one of the steps above is missing. The runtime log line
   `showroom_not_found` names the reason:
   - `flag_off`: the flag isn't on for `demo`.
   - `source_unconfigured`: the Supabase variables are missing in Preview.
   - `unknown_subdomain`: no live brand in a live market with `subdomain = 'demo'` (check the seed:
     brand status, market `live`, spelling).
   - `host_unresolved`: `SHOWROOM_PREVIEW_SUBDOMAIN` is missing in Preview, or the deployment
     isn't a preview.

Catalogue reads are cached per server instance for at most 60 s, a "not found" answer included.
So a seed change, or a fix for `unknown_subdomain`, shows within a minute (ADR 0017).
