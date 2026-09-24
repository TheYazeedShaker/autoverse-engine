-- 0011_job_leases.test.sql
-- MANDATORY test for migration 20260924150000_job_leases.sql (BLOCK finding #5).
-- Proves: a job whose worker died comes back once its lease expires, and its dedupe key is freed
-- with it; a stale worker cannot complete a job it no longer holds; a job that keeps killing its
-- worker still stops at max_attempts; and the new functions are service-role only.

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

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.brands (id, slug, name) values
  ('00000000-0000-0000-0000-00000000000a', 'brand-a', 'Brand A');
insert into public.profiles (id, brand_id, brand_role, platform_role) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'brand_admin', null);

insert into public.jobs (id, kind, payload, dedupe_key) values
  ('00000000-0000-0000-0000-000000001001', 'notify-lead-email', '{"lead_id": "l1"}', 'l1');

-- ---- 1. a claim carries a lease; a live lease is not reaped ----
do $$
declare j public.jobs%rowtype;
begin
  select * into j from public.claim_jobs(10, 60);
  if j.id is null then raise exception 'FAIL: nothing was claimed'; end if;
  if j.lease_token is null or j.locked_until is null then
    raise exception 'CRITICAL: a claimed job has no lease, so a dead worker would hold it forever';
  end if;
  if j.locked_until <= now() then raise exception 'FAIL: the lease is already expired on claim'; end if;

  if public.reap_expired_jobs() <> 0 then
    raise exception 'CRITICAL: a job was reaped from a worker whose lease is still live';
  end if;
  raise notice 'PASS: a claim takes a lease, and a live lease is left alone';
end $$;

-- ---- 2. the worker dies: the lease expires, the job comes back, the dedupe key is freed ----
do $$
declare stale_token uuid; j public.jobs%rowtype; msg text;
begin
  select lease_token into stale_token from public.jobs where id = '00000000-0000-0000-0000-000000001001';

  -- Nobody completes it. Time passes beyond the lease.
  update public.jobs set locked_until = now() - interval '1 second'
   where id = '00000000-0000-0000-0000-000000001001';

  -- While the row is stuck `running`, the same work cannot be queued again. This is the trap.
  msg := test_helpers.try($q$insert into public.jobs (kind, payload, dedupe_key)
    values ('notify-lead-email', '{"lead_id": "l1"}', 'l1')$q$);
  if msg not like '%jobs_outstanding_dedupe_key%' then
    raise exception 'FAIL: expected the dedupe index to hold while the job is outstanding (%)', msg;
  end if;

  -- The next sweep reaps it: back to pending, with a backoff so it isn't handed straight back.
  perform public.reap_expired_jobs();
  select * into j from public.jobs where id = '00000000-0000-0000-0000-000000001001';
  if j.status <> 'pending' then raise exception 'CRITICAL: an expired lease was not reaped (status %)', j.status; end if;
  if j.run_after <= now() then raise exception 'FAIL: a reaped job came back with no backoff'; end if;
  if j.lease_token is not null then raise exception 'FAIL: a reaped job kept the dead worker''s lease'; end if;

  -- The backoff elapses and a new worker claims it, with a new token.
  update public.jobs set run_after = now() - interval '1 second'
   where id = '00000000-0000-0000-0000-000000001001';
  select * into j from public.claim_jobs(10, 60);
  if j.id is distinct from '00000000-0000-0000-0000-000000001001'::uuid then
    raise exception 'CRITICAL: a job whose worker died was never picked up again';
  end if;
  if j.attempts <> 2 then raise exception 'FAIL: the reclaimed job should be on attempt 2 (got %)', j.attempts; end if;
  if j.lease_token = stale_token then raise exception 'CRITICAL: a reclaim reused the dead worker''s token'; end if;

  -- 3. The dead worker wakes up late and tries to report. It must be refused.
  msg := test_helpers.try(format(
    'select public.complete_job(%L, %L, true)', j.id, stale_token));
  if msg not like '%lease lost%' then
    raise exception 'CRITICAL: a worker completed a job it no longer holds (%)', msg;
  end if;
  if (select status from public.jobs where id = j.id) <> 'running' then
    raise exception 'CRITICAL: the stale completion changed the new owner''s job';
  end if;

  -- The rightful owner finishes it.
  perform public.complete_job(j.id, j.lease_token, true);
  if (select status from public.jobs where id = j.id) <> 'done' then
    raise exception 'FAIL: the lease holder could not complete its job';
  end if;
  if (select lease_token from public.jobs where id = j.id) is not null then
    raise exception 'FAIL: a finished job kept its lease';
  end if;

  -- Done, so the same key can come round again.
  msg := test_helpers.try($q$insert into public.jobs (kind, payload, dedupe_key)
    values ('notify-lead-email', '{"lead_id": "l1"}', 'l1')$q$);
  if msg <> '' then raise exception 'FAIL: the dedupe key stayed blocked after completion (%)', msg; end if;

  raise notice 'PASS: a dead worker''s job comes back after its lease, and the late worker cannot overwrite the outcome';
end $$;

-- ---- 4. a job that keeps killing its worker still stops at max_attempts ----
do $$
declare jid uuid := '00000000-0000-0000-0000-000000001002'; i int;
begin
  insert into public.jobs (id, kind, payload, max_attempts) values (jid, 'retry-event-dlq', '{}', 3);
  delete from public.jobs where id <> jid and status = 'pending';

  -- Each round: claimed, the worker dies, the lease expires, it is reaped, the backoff elapses.
  for i in 1..3 loop
    perform public.claim_jobs(10, 60);
    update public.jobs set locked_until = now() - interval '1 second' where id = jid;
    perform public.reap_expired_jobs();
    update public.jobs set run_after = now() - interval '1 second' where id = jid and status = 'pending';
  end loop;

  if (select status from public.jobs where id = jid) <> 'failed' then
    raise exception 'CRITICAL: a job that crashes its worker every time was retried past max_attempts (status %, attempts %)',
      (select status from public.jobs where id = jid), (select attempts from public.jobs where id = jid);
  end if;
  if (select last_error from public.jobs where id = jid) not like '%lease expired%' then
    raise exception 'FAIL: a reaped job does not say why it stopped';
  end if;
  raise notice 'PASS: repeated worker deaths end in failed at max_attempts, with the reason recorded';
end $$;

-- ---- 5. the lease invariant holds in the table itself ----
do $$
declare msg text;
begin
  msg := test_helpers.try($q$insert into public.jobs (kind, status) values ('notify-lead-email', 'running')$q$);
  if msg not like '%jobs_lease_iff_running%' then
    raise exception 'CRITICAL: a running job without a lease could be written (%)', msg;
  end if;
  raise notice 'PASS: a running job without a lease cannot exist';
end $$;

-- ---- 6. the queue functions are service-role only ----
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare msg text;
begin
  msg := test_helpers.try($q$select public.reap_expired_jobs()$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: a brand user can reap jobs (%)', msg; end if;
  msg := test_helpers.try($q$select public.claim_jobs(1, 60)$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: a brand user can claim jobs (%)', msg; end if;
  msg := test_helpers.try($q$select public.complete_job(gen_random_uuid(), gen_random_uuid(), true)$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: a brand user can complete jobs (%)', msg; end if;
  raise notice 'PASS: reap, claim and complete are closed to brand users';
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare msg text;
begin
  msg := test_helpers.try($q$select public.claim_jobs(1, 60)$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: anon can claim jobs (%)', msg; end if;
  raise notice 'PASS: anon cannot touch the queue';
end $$;

rollback;
