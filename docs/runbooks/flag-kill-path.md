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
