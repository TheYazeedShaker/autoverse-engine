# 0011 — the job worker runs as a Supabase Edge Function, fired by pg_cron

**Status:** accepted — 2026-09-24 (owner, `#build-decisions`)

## Context

The 1·A security review found the job queue and both dead-letter queues had no consumer (BLOCK #2).
The production plan requires a worker, alerts on dead letters and a daily reconciliation (§6.2),
and allows the service role only in "CI migration runs and server-side jobs" (§3.1). It names no
runtime.

## Decision

- `services/job-worker` is deployed as the Supabase Edge Function `job-worker`.
- `pg_cron` fires it **every minute** through `pg_net`, with a POST to the function URL. A second
  cron entry fires the daily reconciliation.
- The function URL and the cron secret come from Supabase **Vault** (`job_worker_url`,
  `job_worker_cron_secret`), so neither appears in a migration or in `cron.job`. When either is
  missing, the scheduled call does nothing.
- **Authentication** (owner decision): the scheduled call carries the shared secret in
  `Authorization: Bearer …`. The function compares it with `JOB_WORKER_CRON_SECRET` in constant
  time. A manual "run now" needs a superadmin/ops JWT (`app_auth.can_manage_tenancy()`) instead.
  Anything else gets 401 and runs nothing.
- The service role lives only inside the function (a server-side job), as §3.1 allows.

## Alternatives considered

- **GitHub Actions schedule:** puts the service-role key in a second system, and its minimum
  interval is 5 minutes with no timing guarantee. Rejected.
- **External cron / VM:** new infrastructure to run and pay for. Rejected.

## Consequences

- The queues drain on their own, with at most about a minute's delay. Claiming is exclusive and
  leased (`20260924150000_job_leases.sql`), so overlapping ticks are safe.
- Each run is bounded by a time budget well inside the edge-runtime wall-clock limit. A job's
  timeout stays well inside its lease.
- Rotating the cron secret is a two-place change (Edge Function secret + Vault):
  `docs/runbooks/job-worker-secret-rotation.md`.
