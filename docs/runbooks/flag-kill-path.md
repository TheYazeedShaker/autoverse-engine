# Runbook — exercise a flag end to end (create → off → on → kill)

Proves the flag machinery works in production before any user-facing feature depends on it
(REV2 0-H.6). Uses `health_build_info`, which gates the `build` block on `/api/health`.

**Prerequisites:** `NEXT_PUBLIC_POSTHOG_KEY` (and optionally `NEXT_PUBLIC_POSTHOG_HOST`) set in the
consumer app's Vercel env, then a production redeploy.

| Step      | Action in PostHog                                               | Expected `GET https://autoverse-engine-consumer.vercel.app/api/health` |
| --------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1. create | Flag `health_build_info` exists, boolean, **inactive**          | `{ "status": "ok", "sha": "…" }` — no `build`                          |
| 2. off    | Rollout set to **100%**, toggle still **inactive** (armed, off) | no `build`                                                             |
| 3. on     | Toggle **active**                                               | `build: { time, env: "production" }` present                           |
| 4. kill   | Toggle **inactive**                                             | `build` gone again, within seconds — no redeploy                       |

Also confirm the **outage** case once: with the key removed (or PostHog unreachable), the endpoint
still answers `status: ok` with no `build` — flags fail closed (`apps/consumer/lib/flags.ts`).

Use 100% rollout + the active toggle as the on/off switch. A 0% rollout on an active flag looks
"on" in the UI but evaluates off, which is easy to misread during an incident.

Record the date and outcome of each run in `PROGRESS.md`.

## `page_showroom` — the consumer showroom (PAGE-CONSUMER-SHOWROOM)

Gates the whole showroom page. **Distinct id = the brand-market's subdomain** (e.g. `demo` for
`demo.<CONSUMER_ROOT_DOMAIN>`), so the flag can be enabled per brand-market with a PostHog release
condition on the distinct id, and progressively. It is evaluated without recording
`$feature_flag_called` events (ADR 0017), so PostHog shows no flag-call counts for it; verify with
the page itself.

| Step      | Action in PostHog                                      | Expected on `https://<subdomain>.<root>/`          |
| --------- | ------------------------------------------------------ | -------------------------------------------------- |
| 1. create | Flag `page_showroom` exists, boolean, **inactive**     | generic 404; log `showroom_not_found` `flag_off`   |
| 2. on     | Active, release condition: distinct id = the subdomain | the showroom renders (needs a catalogue source)    |
| 3. kill   | Toggle **inactive**                                    | generic 404 again on the next request; no redeploy |

The flag is checked before any catalogue read, so the kill works even with the database down.
Until the database-backed catalogue source exists (Tier B, read path), step 2 still returns 404
with reason `source_unconfigured`. Steps 1 and 3 can be verified now.

Verified locally 2026-09-26 (no PostHog key → off): `demo.localhost:3000` answered the generic
404 with `reason: flag_off`.
