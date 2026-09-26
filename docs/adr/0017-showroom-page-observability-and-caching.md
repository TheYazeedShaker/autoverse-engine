# 0017 — showroom page: observability and catalogue caching

**Status:** accepted for slice 1 — 2026-09-26 (PAGE-CONSUMER-SHOWROOM). **Amended 2026-09-26** by
the wiring PR, which connects the page to `showroom_catalog` (ADR 0018). The caching interval is
now set, and the metrics and alerts follow the new payload.

## Context

The showroom (`apps/consumer/app/page.tsx`) is the public entry of a brand-market. CLAUDE.md
says a feature without logging, metrics and at least one alert is not done. Spec §3 asks for the
catalogue to "revalidate on a short interval (implementer's choice, recorded in an ADR)".

The page reads its catalogue through a `CatalogSource` seam. In production and on previews that is
`public.showroom_catalog` (ADR 0018), called with the anon key; locally it can be a fixture.

## Decision — observability

Every request logs structured JSON (`apps/consumer/lib/log.ts`, service `consumer-showroom`) with
one `trace_id`, taken from `x-vercel-id`, else a well-formed `x-request-id`, else a fresh UUID. The
same id reaches the flag's failure log (`flag_eval_failed`) and is set as the Sentry `trace_id`
tag for the request. Log lines carry slugs, market codes, vocabulary keys, counts and durations
only. No visitor data and no error messages are logged.

**Metrics** are derived from the log stream, as in ADR 0016:

- **Request outcome:** `showroom_load_done` (with `duration_ms`, `models`) against
  `showroom_not_found` (with `reason`: `host_unresolved | flag_off | source_unconfigured |
unknown_subdomain`).
- **Errors:** `showroom_load_failed` (with `duration_ms`) and `showroom_source_error` (one per
  attempt, with `error` set to the error name: `TimeoutError`, `CatalogHttpError`,
  `CatalogShapeError`, …).
- **Data quality:** `showroom_asset_missing`, `showroom_price_missing`,
  `showroom_model_without_trims`, `showroom_vocabulary_missing`, `showroom_payload_orphan`.
- **Preview:** `showroom_preview_mapping` means a Vercel preview served its configured demo
  brand-market.

**Alerts.** They are log-based, and are set up with the other log alerts when the log drain goes
live (as ADR 0016's are):

| Signal                                                  | Threshold                      | Who                    |
| ------------------------------------------------------- | ------------------------------ | ---------------------- |
| `showroom_source_mismatch`                              | any one                        | **page** (tenant risk) |
| `showroom_source_error` with `error: CatalogShapeError` | any one                        | page (contract break)  |
| `showroom_load_failed`                                  | > 5 in 5 min for one subdomain | page                   |
| `showroom_misconfigured`                                | any one                        | ops                    |
| `showroom_theme_invalid`                                | any one                        | ops                    |
| `showroom_asset_missing` / `showroom_price_missing`     | > 50 in 1 h for one brand      | ops (daily digest)     |
| Sentry `showroom_unavailable`                           | Sentry's new-issue alert       | ops                    |

`showroom_source_mismatch` pages because it means a catalogue read returned another
brand-market's data. The page refuses to render it, and something upstream (a cache key or the
function) is broken. A `CatalogShapeError` means the function and the page's Zod schema disagree.
Every visitor then gets an error page, so it pages as well. The load-failed threshold is a first
guess; revisit it with real traffic.

**Timeouts.** A catalogue read has a 2 s timeout per attempt and one retry (reads are
idempotent), and a timed-out attempt is aborted. The flag check has its own 1.5 s timeout and
fails closed. The worst case before a 5xx is 5.5 s.

**Flag evaluation.** `page_showroom` is keyed by the brand-market's subdomain, which a visitor can
choose freely under wildcard DNS. So flags are evaluated with `sendFeatureFlagEvents: false` and
`disableGeoip: true`: an arbitrary host creates no PostHog events or persons. The flag is checked
before any catalogue read, so the kill path needs no database.

## Caching (amended: the interval is set)

- **The page renders per request.** Reading the Host header already makes the route dynamic.
- **Not Next's data cache.** It serves an expired entry once more while it refreshes in the
  background (stale-while-revalidate, `patch-fetch` in Next 16.3). After a quiet spell, the first
  visitor would get a snapshot of **any** age, so an unpublished, embargoed model could reach a real
  visitor. The catalogue fetch is therefore `cache: "no-store"`.
- **Our own cache with a hard expiry.** `withHardTtlCache` (`apps/consumer/lib/showroom/source.ts`)
  keeps the snapshot per subdomain, per server instance, for **at most 60 seconds**
  (`CATALOG_TTL_SECONDS`).
  - An older entry is **never** served: it is dropped and the database is read.
  - A null answer (no such live brand-market) is cached too; errors never are.
  - At most 200 subdomains per instance, oldest evicted first. Only flag-enabled subdomains get
    past the flag check to reach it.
- **So the bound is exact:** a publish, an unpublish, or a brand or market going off live reaches
  every page within 60 s. Each warm instance reads the catalogue at most once a minute per
  brand-market.
  - 60 s is a first value: short enough for a launch-day correction, and it keeps a traffic spike
    at about one database call per brand-market per instance per minute.
  - An immediate take-down would need a purge signal from the publish step to every instance. That
    is recorded as a 1·B option, not built now.
- **Guarantees:**
  - One brand-market's snapshot is never served under another's host: the cache key is the
    subdomain, and the page re-checks `market.subdomain` against the host on every request.
  - A flag kill takes effect on the next request, because the flag is evaluated before the source.
  - Every snapshot was validated by the Zod schema when it was read, and a cached one is never
    older than 60 s.
- **No `dynamic = "force-dynamic"`.** It isn't needed (the Host header already makes the route
  dynamic), and it would also change every other fetch on the page.
- **Trace id.** Each read sends the request's trace id to the database gateway as `x-request-id`,
  so gateway logs join the page's. With Next's cache out of the picture, a per-request header
  costs nothing.
- **The key** in `SUPABASE_ANON_KEY` is the project's legacy **anon** JWT, sent as both `apikey`
  and `Authorization: Bearer`. If the project moves to the new publishable keys, check the
  gateway's accepted header form first.

## Consequences

- An alert exists for every failure path the page adds; wiring them waits on the log drain (as
  for ADR 0016).
- `docs/runbooks/flag-kill-path.md` covers `page_showroom`.
- The catalogue cache has a hard 60 s expiry (see _Caching_). Revisit it with real traffic.
