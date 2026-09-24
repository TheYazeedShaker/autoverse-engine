# Runbook — rotate the job-worker cron secret

**When:** on any suspicion the secret leaked (production plan §14), when someone with access
leaves, or on the regular rotation schedule.

**What it is:** the shared secret the per-minute `pg_cron` call sends to the `job-worker` Edge
Function (ADR 0011). It lives in two places that must match:

- Edge Function secret `JOB_WORKER_CRON_SECRET`: what the function checks against.
- Vault secret `job_worker_cron_secret`: what `pg_cron` sends.

## Steps (a minute or two; the queue simply waits)

1. **Generate** a new value locally: `openssl rand -hex 32`. Never paste it into chat, Slack or
   a ticket.
2. **Update the Edge Function secret** (Dashboard → Edge Functions → Secrets →
   `JOB_WORKER_CRON_SECRET`). From this moment scheduled calls are refused with 401. Nothing is
   lost: jobs stay `pending` and dead letters stay unresolved.
3. **Update Vault** (Dashboard → Database → Vault → `job_worker_cron_secret`) to the same value.
4. **Verify** within two minutes:
   - Edge Function logs show `worker_run_finished` again, and no more 401s.
   - `select count(*) from public.jobs where status = 'pending' and run_after < now() - interval '5 minutes';`
     trends to 0.
5. Record the rotation (date and who did it; never the value) in the ops log.

## If it goes wrong

- **401s continue:** the two values differ. Re-enter both from the same generated value.
- **Nothing runs and there are no 401s either:** check the Vault entries `job_worker_url` and
  `job_worker_cron_secret` exist (the cron call does nothing without them), and
  `select * from cron.job_run_details order by start_time desc limit 5;`.
