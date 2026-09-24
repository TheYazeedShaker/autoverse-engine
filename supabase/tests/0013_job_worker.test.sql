-- 0013_job_worker.test.sql
-- MANDATORY test for migration 20260924200000_job_worker.sql (BLOCK finding #2).
-- Proves: a sweep is queued only when a queue has something to drain; at most one sweep per queue
-- is outstanding, so two workers never replay the same dead letter; resolved and given-up rows are
-- not swept again; the dead letters stay staff-only; and enqueue_dlq_sweeps is service-role only.

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

-- ---- 1. nothing to drain, nothing queued ----
do $$
begin
  if public.enqueue_dlq_sweeps() <> 0 then raise exception 'FAIL: a sweep was queued for empty queues'; end if;
  raise notice 'PASS: empty dead-letter queues queue no sweep';
end $$;

-- ---- 2. one sweep per queue, however often the scheduler fires ----
insert into public.event_dlq (source_payload, error_message) values ('{"id": "x"}', 'test');
insert into public.lead_dlq  (source_payload, error_message) values ('{"phone": "x"}', 'test');
do $$
declare n int;
begin
  if public.enqueue_dlq_sweeps() <> 2 then raise exception 'FAIL: expected one sweep per non-empty queue'; end if;
  if public.enqueue_dlq_sweeps() <> 0 then
    raise exception 'CRITICAL: a second sweep was queued while one is outstanding — two workers could replay the same dead letter';
  end if;
  select count(*) into n from public.jobs where dedupe_key = 'sweep';
  if n <> 2 then raise exception 'FAIL: % sweep jobs, expected 2', n; end if;

  -- Still outstanding while a worker holds it.
  perform public.claim_jobs(10, 60);
  if public.enqueue_dlq_sweeps() <> 0 then
    raise exception 'CRITICAL: a sweep was queued while another worker is running one';
  end if;
  raise notice 'PASS: at most one sweep per queue is outstanding, pending or running';
end $$;

-- ---- 3. resolved and given-up rows are never swept again ----
do $$
begin
  update public.jobs set status = 'done', lease_token = null, locked_until = null where dedupe_key = 'sweep';
  update public.event_dlq set resolved_at = now();
  update public.lead_dlq set attempts = 5, last_error = 'gave up';

  if public.enqueue_dlq_sweeps() <> 0 then
    raise exception 'FAIL: a sweep was queued for rows that are resolved or have used their attempts';
  end if;
  if (select error_message from public.lead_dlq limit 1) <> 'test' then
    raise exception 'FAIL: the original failure reason was overwritten';
  end if;
  raise notice 'PASS: resolved and given-up dead letters are left alone, original cause intact';
end $$;

-- ---- 4. dead letters stay staff-only; the sweep function is service-role only ----
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare n int; msg text;
begin
  select count(*) into n from public.event_dlq;
  if n <> 0 then raise exception 'CRITICAL: a brand user reads event dead letters (got %)', n; end if;
  select count(*) into n from public.lead_dlq;
  if n <> 0 then raise exception 'CRITICAL: a brand user reads lead dead letters — they hold PII (got %)', n; end if;
  msg := test_helpers.try($q$select public.enqueue_dlq_sweeps()$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: a brand user can queue sweeps (%)', msg; end if;
  msg := test_helpers.try($q$update public.lead_dlq set resolved_at = now()$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: a brand user can resolve a dead letter (%)', msg; end if;
  raise notice 'PASS: a brand user cannot read, resolve or sweep dead letters';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.lead_dlq) <> 1 then raise exception 'FAIL: ops staff should see the lead dead letter'; end if;
  raise notice 'PASS: staff can see resolved and open incidents';
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare msg text;
begin
  msg := test_helpers.try($q$select public.enqueue_dlq_sweeps()$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: anon can queue sweeps (%)', msg; end if;
  raise notice 'PASS: anon cannot touch the dead-letter queues';
end $$;

rollback;
