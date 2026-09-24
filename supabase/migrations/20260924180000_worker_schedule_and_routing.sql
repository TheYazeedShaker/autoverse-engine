-- 20260924180000_worker_schedule_and_routing.sql
-- ENGINE-CORE-1A — the worker runs on its own, and lead routing has what it needs.
--
-- Owner decisions (#build-decisions, recorded in ADR 0011 and ADR 0012):
--   * The job-worker Edge Function is fired by pg_cron + pg_net every minute. The call carries a
--     shared secret. The function URL and the secret are read from Vault at call time, so neither
--     is written into this migration or into cron.job.
--   * A daily reconciliation runs as a job on the same queue.
--   * Lead webhooks are signed with a per-(brand, market) secret held in Vault and referenced from
--     brand_market_private.
--
-- No brand-scoped table is added. brand_market_private gains one column and keeps its existing
-- RLS (owning brand + staff read, service role writes).

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ============================================================================================
-- Firing the worker
-- ============================================================================================
-- Reads the URL and secret from Vault and queues an HTTP POST through pg_net (asynchronous: the
-- cron tick never waits on the function). With either secret missing it does nothing and says
-- so, which is the state of any environment where the worker isn't deployed yet (CI, local).
create or replace function app_auth.invoke_job_worker()
returns bigint
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  worker_url text;
  worker_secret text;
begin
  select decrypted_secret into worker_url    from vault.decrypted_secrets where name = 'job_worker_url';
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name = 'job_worker_cron_secret';
  if worker_url is null or worker_secret is null then
    raise log 'job-worker not invoked: job_worker_url / job_worker_cron_secret missing from Vault';
    return null;
  end if;

  return net.http_post(
    url := worker_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || worker_secret
    ),
    timeout_milliseconds := 10000
  );
end $fn$;

-- The daily reconciliation is a job like any other, so it gets a lease, retries and a visible
-- outcome. The fixed dedupe key means a missed day can't stack up two runs.
create or replace function app_auth.enqueue_daily_reconciliation()
returns void
language sql
security definer
set search_path = ''
as $fn$
  insert into public.jobs (kind, payload, dedupe_key)
  values ('daily-reconciliation', '{}'::jsonb, 'daily')
  on conflict do nothing;
$fn$;

revoke execute on function app_auth.invoke_job_worker()             from public, anon, authenticated;
revoke execute on function app_auth.enqueue_daily_reconciliation()  from public, anon, authenticated;

-- Re-running this migration (a reset) replaces the schedules rather than duplicating them.
select cron.unschedule(jobid) from cron.job where jobname in ('job-worker', 'daily-reconciliation');
select cron.schedule('job-worker',           '* * * * *', 'select app_auth.invoke_job_worker()');
select cron.schedule('daily-reconciliation', '0 3 * * *', 'select app_auth.enqueue_daily_reconciliation()');

-- What the reconciliation reports. One read, so the worker doesn't need to know table layout.
-- Counts only: no payloads, no PII.
create or replace function public.reconciliation_report()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select jsonb_build_object(
    'event_dlq_open',    (select count(*) from public.event_dlq where resolved_at is null),
    'event_dlq_gave_up', (select count(*) from public.event_dlq where resolved_at is null and attempts >= 5),
    'lead_dlq_open',     (select count(*) from public.lead_dlq  where resolved_at is null),
    'lead_dlq_gave_up',  (select count(*) from public.lead_dlq  where resolved_at is null and attempts >= 5),
    'jobs_failed_24h',   (select count(*) from public.jobs where status = 'failed' and updated_at > now() - interval '1 day'),
    'jobs_overdue',      (select count(*) from public.jobs where status = 'pending' and run_after < now() - interval '15 minutes'),
    'events_24h',        (select count(*) from public.events where received_at > now() - interval '1 day'),
    'leads_24h',         (select count(*) from public.leads  where created_at  > now() - interval '1 day')
  );
$fn$;

revoke execute on function public.reconciliation_report() from public, anon, authenticated;
grant  execute on function public.reconciliation_report() to service_role;

-- ============================================================================================
-- Lead routing
-- ============================================================================================
-- The Vault id of this brand-market's webhook signing secret (ADR 0012). A reference, never the
-- secret itself. Rotating means pointing at a new Vault entry.
alter table public.brand_market_private add column lead_routing_webhook_secret_id uuid;

-- Everything a routing job needs for one lead, in one call: the lead as captured, where to send
-- it, and (for the webhook) the decrypted signing secret. Service role only: this is the worker's
-- read, and it returns PII and a secret.
create or replace function public.lead_routing(p_lead_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select jsonb_build_object(
    'lead', jsonb_build_object(
      'id', l.id, 'brand_id', l.brand_id, 'market_code', l.market_code,
      'full_name', l.full_name, 'phone', l.phone, 'city', l.city,
      'model_id', l.model_id, 'trim_id', l.trim_id, 'preferred_time', l.preferred_time,
      'type', l.type, 'consent_text_version', l.consent_text_version, 'consent_at', l.consent_at,
      'created_at', l.created_at
    ),
    'emails', coalesce(to_jsonb(p.lead_routing_emails), '[]'::jsonb),
    'webhook_url', p.lead_routing_webhook_url,
    'webhook_secret', (select s.decrypted_secret from vault.decrypted_secrets s
                        where s.id = p.lead_routing_webhook_secret_id)
  )
  from public.leads l
  left join public.brand_market_private p
         on p.brand_id = l.brand_id and p.market_code = l.market_code
  where l.id = p_lead_id;
$fn$;

revoke execute on function public.lead_routing(uuid) from public, anon, authenticated;
grant  execute on function public.lead_routing(uuid) to service_role;
