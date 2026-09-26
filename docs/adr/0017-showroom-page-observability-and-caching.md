# 0017 — showroom page: observability, and caching deferred to the catalogue source

**Status:** accepted for slice 1 — 2026-09-26 (PAGE-CONSUMER-SHOWROOM). The caching half is
deliberately open until the read-path decision lands (see _Caching_).

## Context

The showroom (`apps/consumer/app/page.tsx`) is the public entry of a brand-market. CLAUDE.md
says a feature without logging, metrics and at least one alert is not done. Spec §3 asks for the
catalogue to "revalidate on a short interval (implementer's choice, recorded in an ADR)".

In slice 1 the page reads its catalogue through a `CatalogSource` seam and no database-backed
source exists yet. How an anonymous visitor reads the published catalogue is an open Tier B
decision in `#build-decisions` (2026-09-26).

## Decision — observability

Every request logs structured JSON (`apps/consumer/lib/log.ts`, service `consumer-showroom`) with
one `trace_id`, taken from `x-vercel-id`, else a well-formed `x-request-id`, else a fresh UUID. The
same id reaches the flag's failure log (`flag_eval_failed`) and is set as the Sentry `trace_id`
tag for the request. Log lines carry slugs, market codes, counts and durations only. No visitor
data and no error messages are logged.

**Metrics** are derived from the log stream, like ADR 0016's:

- request outcome: `showroom_load_done` (with `duration_ms`, `models`) against `showroom_not_found`
  (with `reason`: `host_unresolved | flag_off | source_unconfigured | unknown_subdomain | not_live`)
- errors: `showroom_load_failed` (with `duration_ms`) and `showroom_source_error` (per attempt,
  with `error` = the error name)
- data quality: `showroom_asset_missing`, `showroom_price_missing`,
  `showroom_model_without_trims`, `showroom_price_currency_unsupported`

**Alerts.** They are log-based, and are set up with the other log alerts when the log drain goes
live (as ADR 0016's are):

| Signal                                                  | Threshold                      | Who                    |
| ------------------------------------------------------- | ------------------------------ | ---------------------- |
| `showroom_source_mismatch` or `showroom_theme_mismatch` | any one                        | **page** (tenant risk) |
| `showroom_load_failed`                                  | > 5 in 5 min for one subdomain | page                   |
| `showroom_misconfigured`                                | any one                        | ops                    |
| `showroom_theme_invalid`                                | any one                        | ops                    |
| `showroom_asset_missing` / `showroom_price_missing`     | > 50 in 1 h for one brand      | ops (daily digest)     |
| Sentry `showroom_unavailable`                           | Sentry's new-issue alert       | ops                    |

The mismatch alerts page because they mean a catalogue source returned another brand-market's
data. The page refuses to render it, and the source is broken. The load-failed threshold is a
first guess; revisit it with real traffic.

**Timeouts.** A catalogue read has a 2 s timeout per attempt and one retry (reads are
idempotent), and a timed-out attempt is aborted. The flag check has its own 1.5 s timeout and fails
closed. The worst case before a 5xx is 5.5 s.

**Flag evaluation.** `page_showroom` is keyed by the brand-market's subdomain, which a visitor can
choose freely under wildcard DNS. So flags are evaluated with `sendFeatureFlagEvents: false` and
`disableGeoip: true`: an arbitrary host creates no PostHog events or persons. The flag is checked
before any catalogue read, so the kill path needs no database.

## Caching — deferred, on purpose

The page renders per request (`dynamic = "force-dynamic"`), because the brand comes from the
Host header. The spec's "short revalidation interval" belongs in the database-backed
`CatalogSource`: that is where a request cache (a fetch `revalidate`, keyed by subdomain) can
live. It is written in the PR that adds that source, once the read-path Tier B is answered. This
ADR is then amended with the interval. Slice 1 has nothing to cache: the only source is the local
fixture.

Requirements already fixed for that cache: the key includes the subdomain, a cached snapshot
still passes the page's second-layer checks (subdomain, brand ids, live and published state,
theme ownership), and a flag kill takes effect without waiting for the cache, since the flag is
evaluated per request before the source.

## Consequences

- An alert exists for every failure path the page adds; wiring them waits on the log drain (as
  for ADR 0016).
- `docs/runbooks/flag-kill-path.md` covers `page_showroom`.
- The revalidation interval is still owed and is tracked in PROGRESS.md.
