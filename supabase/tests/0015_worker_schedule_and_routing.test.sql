-- 0015_worker_schedule_and_routing.test.sql
-- MANDATORY test for migration 20260924180000_worker_schedule_and_routing.sql.
-- Proves: the worker is scheduled every minute and the reconciliation daily; the scheduled call
-- does nothing without its Vault secrets, and with them sends the shared secret (never written into
-- cron.job); the daily reconciliation can't stack; lead_routing returns a lead's routing and its
-- decrypted signing secret to the service role only; and no brand user or anon can reach the
-- routing, the report, the invoker, or another brand's secret.

begin;

create schema test_helpers;
grant usage on schema test_helpers to anon, authenticated, service_role;
create function test_helpers.try(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return '';
exception when others then
  return sqlerrm;
end $$;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1');
insert into public.brands (id, slug, name) values
  ('00000000-0000-0000-0000-00000000000a', 'brand-a', 'Brand A'),
  ('00000000-0000-0000-0000-00000000000b', 'brand-b', 'Brand B');
insert into public.profiles (id, brand_id, brand_role, platform_role) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'brand_admin', null),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'brand_admin', null);
insert into public.brand_markets (brand_id, market_code, currency, locale, live) values
  ('00000000-0000-0000-0000-00000000000a', 'EG', 'EGP', 'ar-EG', true),
  ('00000000-0000-0000-0000-00000000000b', 'EG', 'EGP', 'ar-EG', true);

-- ---- 1. scheduled, and the secret is not in the schedule ----
do $$
declare cmd text;
begin
  select command into cmd from cron.job where jobname = 'job-worker' and schedule = '* * * * *';
  if cmd is null then raise exception 'CRITICAL: the job worker is not scheduled every minute — the queues would never drain'; end if;
  if cmd <> 'select app_auth.invoke_job_worker()' then raise exception 'FAIL: unexpected worker command (%)', cmd; end if;
  if not exists (select 1 from cron.job where jobname = 'daily-reconciliation' and schedule = '0 3 * * *') then
    raise exception 'FAIL: the daily reconciliation is not scheduled';
  end if;
  if exists (select 1 from cron.job where command ilike '%bearer%' or command ilike '%secret%') then
    raise exception 'CRITICAL: a secret is written into cron.job';
  end if;
  raise notice 'PASS: worker every minute, reconciliation daily, no secret in the schedule';
end $$;

-- ---- 2. no Vault secrets: the tick does nothing; with them: it sends the secret ----
do $$
declare req bigint; hdr jsonb;
begin
  if app_auth.invoke_job_worker() is not null then
    raise exception 'FAIL: the worker was called with no URL or secret configured';
  end if;

  perform vault.create_secret('https://worker.example.test/functions/v1/job-worker', 'job_worker_url');
  perform vault.create_secret('test-cron-secret', 'job_worker_cron_secret');
  req := app_auth.invoke_job_worker();
  if req is null then raise exception 'CRITICAL: the worker was not called with its secrets configured'; end if;

  select headers into hdr from net.http_request_queue where id = req;
  if hdr ->> 'Authorization' <> 'Bearer test-cron-secret' then
    raise exception 'CRITICAL: the scheduled call does not carry the shared secret (%)', hdr ->> 'Authorization';
  end if;
  raise notice 'PASS: the tick is a no-op until configured, then carries the shared secret';
end $$;

-- ---- 3. the daily reconciliation can't stack ----
do $$
begin
  perform app_auth.enqueue_daily_reconciliation();
  perform app_auth.enqueue_daily_reconciliation();
  if (select count(*) from public.jobs where kind = 'daily-reconciliation') <> 1 then
    raise exception 'FAIL: two reconciliations were queued at once';
  end if;
  raise notice 'PASS: one reconciliation outstanding at a time';
end $$;

-- ---- 4. lead_routing: the lead, its recipients and its decrypted signing secret ----
do $$
declare secret_id uuid; lead_id uuid; r jsonb;
begin
  secret_id := vault.create_secret('whsec_brand_a', 'brand-a-eg-webhook');
  insert into public.brand_market_private (brand_id, market_code, lead_routing_emails, lead_routing_webhook_url, lead_routing_webhook_secret_id)
  values ('00000000-0000-0000-0000-00000000000a', 'EG', '{sales@a.example.com}', 'https://hooks.a.example.com/leads', secret_id),
         ('00000000-0000-0000-0000-00000000000b', 'EG', '{sales@b.example.com}', null, null);

  lead_id := public.capture_lead(jsonb_build_object(
    'brand_id', '00000000-0000-0000-0000-00000000000a', 'market_code', 'EG',
    'full_name', 'Fatma Hassan', 'phone', '+201000000001',
    'consent_text_version', 'eg-v1', 'consent_at', now()::text,
    'submission_id', '00000000-0000-0000-0000-00000000e001'));

  r := public.lead_routing(lead_id);
  if r -> 'lead' ->> 'id' <> lead_id::text then raise exception 'FAIL: routing is for the wrong lead'; end if;
  if r -> 'emails' <> '["sales@a.example.com"]'::jsonb then
    raise exception 'CRITICAL: a lead is routed to someone else''s inbox (%)', r -> 'emails';
  end if;
  if r ->> 'webhook_secret' <> 'whsec_brand_a' then raise exception 'FAIL: the signing secret was not resolved'; end if;
  if public.lead_routing(gen_random_uuid()) is not null then raise exception 'FAIL: a missing lead produced routing'; end if;
  raise notice 'PASS: lead_routing returns the lead''s own brand-market recipients and signing secret';
end $$;

-- ---- 5. only the service role reaches any of it ----
set local role service_role;
do $$
begin
  perform public.reconciliation_report();
  perform public.lead_routing(gen_random_uuid());
  raise notice 'PASS: the service role can read routing and the report';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$
declare msg text;
begin
  msg := test_helpers.try($q$select public.lead_routing((select id from public.leads limit 1))$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: a brand user can call lead_routing (%)', msg; end if;
  msg := test_helpers.try($q$select public.reconciliation_report()$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: a brand user can read the reconciliation report (%)', msg; end if;
  msg := test_helpers.try($q$select app_auth.invoke_job_worker()$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: a brand user can fire the worker (%)', msg; end if;
  msg := test_helpers.try($q$select app_auth.enqueue_daily_reconciliation()$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: a brand user can queue reconciliations (%)', msg; end if;
  msg := test_helpers.try($q$select count(*) from vault.decrypted_secrets$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: a brand user can read Vault (%)', msg; end if;
  if exists (select 1 from public.brand_market_private where brand_id = '00000000-0000-0000-0000-00000000000a') then
    raise exception 'CRITICAL: brand B reads brand A''s routing config';
  end if;
  raise notice 'PASS: a brand user reaches no routing, report, invoker, Vault, or other brand''s config';
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare msg text;
begin
  msg := test_helpers.try($q$select public.lead_routing(gen_random_uuid())$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: anon can call lead_routing (%)', msg; end if;
  msg := test_helpers.try($q$select app_auth.invoke_job_worker()$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: anon can fire the worker (%)', msg; end if;
  raise notice 'PASS: anon reaches none of it';
end $$;

rollback;
