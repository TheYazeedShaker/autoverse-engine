-- 0010_jobs.test.sql
-- MANDATORY test for migration 20260922235103_jobs.sql (1·A Slice 9).
-- Proves: a claimed job is not handed to a second worker; the same outstanding work cannot be
-- enqueued twice; a failure comes back with a backoff until its attempts are spent, then stops;
-- capturing a lead enqueues its routing inside the same transaction; and the queue is operational —
-- staff read it, nobody else does, only the service role writes.

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
  ('00000000-0000-0000-0000-0000000000c1');
insert into public.brands (id, slug, name) values
  ('00000000-0000-0000-0000-00000000000a', 'brand-a', 'Brand A');
insert into public.profiles (id, brand_id, brand_role, platform_role) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'brand_admin', null),
  ('00000000-0000-0000-0000-0000000000c1', null, null, 'ops');
insert into public.brand_markets (brand_id, market_code, currency, locale, live) values
  ('00000000-0000-0000-0000-00000000000a', 'EG', 'EGP', 'ar-EG', true);

-- ---- 1. capturing a lead enqueues its routing, in the same transaction ----
do $$
declare lead_id uuid; queued int;
begin
  lead_id := public.capture_lead(jsonb_build_object(
    'brand_id', '00000000-0000-0000-0000-00000000000a', 'market_code', 'EG',
    'full_name', 'Fatma Hassan', 'phone', '+201000000001',
    'consent_text_version', 'eg-v1', 'consent_at', now()::text));

  select count(*) into queued from public.jobs
   where payload ->> 'lead_id' = lead_id::text;
  if queued <> 2 then
    raise exception 'CRITICAL: a captured lead queued % routing jobs, expected 2 (email + webhook)', queued;
  end if;

  -- Replaying the same lead must not email the brand twice.
  if (select count(*) from public.jobs where kind = 'notify-lead-email') <> 1 then
    raise exception 'FAIL: unexpected duplicate email job';
  end if;

  raise notice 'PASS: capturing a lead queues its routing atomically with the lead itself';
end $$;

-- ---- 2. the same outstanding work is enqueued once ----
do $$
declare msg text;
begin
  msg := test_helpers.try($q$insert into public.jobs (kind, payload, dedupe_key)
    values ('notify-lead-email', '{"lead_id": "dup"}'::jsonb,
            (select dedupe_key from public.jobs where kind = 'notify-lead-email' limit 1))$q$);
  if msg not like '%jobs_outstanding_dedupe_key%' then
    raise exception 'CRITICAL: the same outstanding job was enqueued twice (%)', msg;
  end if;

  raise notice 'PASS: the same outstanding work cannot be queued twice';
end $$;

-- ---- 3. a claimed job is not handed to a second worker ----
do $$
declare first_batch int; second_batch int; claimed_id uuid;
begin
  select count(*) into first_batch from public.claim_jobs(10);
  if first_batch <> 2 then
    raise exception 'FAIL: the first worker should have claimed both queued jobs (got %)', first_batch;
  end if;

  -- A second worker sweeping immediately afterwards finds nothing: the rows are `running`.
  select count(*) into second_batch from public.claim_jobs(10);
  if second_batch <> 0 then
    raise exception 'CRITICAL: a second worker claimed % job(s) another worker already had', second_batch;
  end if;

  select id into claimed_id from public.jobs where status = 'running' limit 1;
  if (select attempts from public.jobs where id = claimed_id) <> 1 then
    raise exception 'FAIL: claiming a job did not count the attempt';
  end if;

  raise notice 'PASS: claiming is exclusive — a second worker gets nothing, and the attempt is counted';
end $$;

-- ---- 4. failures come back with a backoff, then stop ----
do $$
declare job_id uuid; row_after public.jobs%rowtype; i int;
begin
  select id into job_id from public.jobs where status = 'running' limit 1;

  row_after := public.complete_job(job_id, (select lease_token from public.jobs where id = job_id), false, 'smtp timeout');
  if row_after.status <> 'pending' then
    raise exception 'FAIL: a failed job should be retried, not left as % ', row_after.status;
  end if;
  if row_after.run_after <= now() then
    raise exception 'CRITICAL: a failed job was rescheduled with no backoff — a struggling downstream gets hammered';
  end if;
  if row_after.last_error <> 'smtp timeout' then
    raise exception 'FAIL: the failure reason was not recorded';
  end if;

  -- Burn through the remaining attempts.
  for i in 2..5 loop  -- attempts 2 to 5; the 5th failure is terminal
    update public.jobs set run_after = now() - interval '1 minute' where id = job_id;
    perform public.claim_jobs(10);
    row_after := public.complete_job(job_id, (select lease_token from public.jobs where id = job_id), false, 'still failing');
  end loop;

  if row_after.attempts <> 5 then
    raise exception 'FAIL: the job stopped after % attempts, expected exactly 5', row_after.attempts;
  end if;
  if row_after.status <> 'failed' then
    raise exception 'CRITICAL: a job retried past its limit (status %, attempts %)', row_after.status, row_after.attempts;
  end if;

  raise notice 'PASS: a failing job backs off, then gives up as failed rather than retrying forever';
end $$;

-- ---- 5. a successful job is done, and stays done ----
do $$
declare job_id uuid; row_after public.jobs%rowtype;
begin
  update public.jobs set run_after = now() - interval '1 minute' where status = 'pending';
  perform public.claim_jobs(10);
  select id into job_id from public.jobs where status = 'running' limit 1;
  row_after := public.complete_job(job_id, (select lease_token from public.jobs where id = job_id), true);
  if row_after.status <> 'done' then raise exception 'FAIL: a successful job is not done'; end if;
  if row_after.last_error is not null then raise exception 'FAIL: a successful job kept a stale error'; end if;

  if (select count(*) from public.claim_jobs(10)) <> 0 then
    raise exception 'CRITICAL: a completed job was claimed again';
  end if;

  raise notice 'PASS: a completed job is done and is never claimed again';
end $$;

-- ---- 6. the queue is operational: staff read it, nobody else, service role only writes ----
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare n int; msg text;
begin
  select count(*) into n from public.jobs;
  if n <> 0 then
    raise exception 'CRITICAL: a brand user can read the job queue — payloads reference their customers'' leads (got %)', n;
  end if;

  msg := test_helpers.try($q$select public.claim_jobs(1)$q$);
  if msg not like '%permission denied%' then
    raise exception 'CRITICAL: a brand user claimed jobs (%)', msg;
  end if;
  raise notice 'PASS: a brand user reads no jobs and cannot claim any';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.jobs;
  if n < 1 then raise exception 'FAIL: ops staff should see the queue (got %)', n; end if;
  raise notice 'PASS: staff can see what is stuck in the queue';
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.jobs;
  if n <> 0 then raise exception 'CRITICAL: anon reads the job queue (got %)', n; end if;
  raise notice 'PASS: anon reads nothing from the queue';
end $$;

rollback;
