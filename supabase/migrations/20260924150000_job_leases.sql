-- 20260924150000_job_leases.sql
-- ENGINE-CORE-1A — claimed jobs get a lease, and an expired lease is reaped.
--
-- Fixes BLOCK finding #5. A worker that died mid-job left its row `running` forever. The dedupe
-- index covers ('pending', 'running'), so the same work could then never be enqueued again either:
-- one crash silently switched off, for example, every future notification for that lead.
--
-- Now:
--   * claim_jobs stamps each row with a lease (locked_until) and a lease_token that is unique per
--     claim.
--   * Before claiming, claim_jobs reaps every running row whose lease has expired. The row goes back
--     to pending, or to failed if its attempts are spent. Each claim already counted an attempt, so
--     a job that keeps killing its worker still stops at max_attempts.
--   * A lease is not renewable. The worker's per-job timeout must stay well inside lease_seconds
--     (services/job-worker/worker.ts), or a slow but live job would be reaped and run twice.
--     Every kind is idempotent, so that is survivable, but it is not intended.
--   * complete_job needs the lease_token. A worker whose lease expired and was reclaimed by another
--     worker cannot then mark the job done or failed over the top of the new owner.
--
-- No table is added, so there is no new RLS surface. `jobs` keeps its staff-read policy, and its
-- functions stay service-role only.

-- Any row left running by a worker that no longer exists predates leases and can never finish.
-- Treat it as the reaper would: back to the queue, or failed if its attempts are already spent.
update public.jobs
   set status = (case when attempts >= max_attempts then 'failed' else 'pending' end)::public.job_status,
       last_error = 'reclaimed: running without a lease',
       run_after = now()
 where status = 'running';

alter table public.jobs
  add column locked_until timestamptz,
  add column lease_token  uuid,
  add constraint jobs_lease_iff_running check (
    (status = 'running') = (lease_token is not null and locked_until is not null)
  );

create index jobs_expired_lease_idx on public.jobs (locked_until) where status = 'running';

-- ---------- reaping ----------
create or replace function public.reap_expired_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare reaped integer;
begin
  -- skip locked: two workers reaping at once each take different rows instead of queueing behind
  -- (or deadlocking on) each other. A row one worker skips, the next sweep reaps.
  update public.jobs
     set status = (case when attempts >= max_attempts then 'failed' else 'pending' end)::public.job_status,
         lease_token = null,
         locked_until = null,
         -- The same backoff as a reported failure: a job that keeps killing its worker is not
         -- handed straight back to the next one.
         run_after = now() + (power(2, least(attempts, 10)) * interval '1 second'),
         last_error = 'lease expired: the worker did not finish'
   where id in (
     select id from public.jobs
      where status = 'running' and locked_until < now()
      for update skip locked
   );
  get diagnostics reaped = row_count;
  return reaped;
end $fn$;

-- ---------- claiming, now with a lease ----------
drop function public.claim_jobs(integer);

create function public.claim_jobs(batch_size integer default 10, lease_seconds integer default 300)
returns setof public.jobs
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  perform public.reap_expired_jobs();

  -- One statement, so two workers cannot claim the same row (see 20260922235103_jobs.sql).
  return query
  with claimed as (
    update public.jobs j
       set status = 'running',
           attempts = j.attempts + 1,
           lease_token = gen_random_uuid(),
           locked_until = now() + make_interval(secs => greatest(lease_seconds, 1)),
           updated_at = now()
     where j.id in (
       select q.id from public.jobs q
        where q.status = 'pending' and q.run_after <= now()
        order by q.run_after
        limit greatest(batch_size, 1)
        for update skip locked
     )
    returning j.*
  )
  select * from claimed;
end $fn$;

-- ---------- completing, only by the current lease holder ----------
drop function public.complete_job(uuid, boolean, text);

create function public.complete_job(
  job_id uuid, token uuid, succeeded boolean, error_text text default null
)
returns public.jobs
language plpgsql
security definer
set search_path = ''
as $fn$
declare result public.jobs%rowtype;
begin
  if succeeded then
    update public.jobs
       set status = 'done', last_error = null, lease_token = null, locked_until = null
     where id = job_id and status = 'running' and lease_token = token
    returning * into result;
  else
    update public.jobs
       set status = (case when attempts >= max_attempts then 'failed' else 'pending' end)::public.job_status,
           -- Exponential backoff: 2s, 4s, 8s… so a struggling downstream is not hammered.
           run_after = now() + (power(2, least(attempts, 10)) * interval '1 second'),
           last_error = error_text,
           lease_token = null,
           locked_until = null
     where id = job_id and status = 'running' and lease_token = token
    returning * into result;
  end if;

  if result.id is null then
    if not exists (select 1 from public.jobs where id = job_id) then
      raise exception 'job % does not exist', job_id;
    end if;
    -- The lease expired and the job was reaped, and possibly reclaimed by another worker. That
    -- worker owns the outcome now.
    raise exception 'job % lease lost: it is no longer held by this worker', job_id
      using errcode = 'lock_not_available';
  end if;
  return result;
end $fn$;

revoke execute on function public.reap_expired_jobs()                         from public, anon, authenticated;
revoke execute on function public.claim_jobs(integer, integer)                from public, anon, authenticated;
revoke execute on function public.complete_job(uuid, uuid, boolean, text)     from public, anon, authenticated;
grant  execute on function public.reap_expired_jobs()                         to service_role;
grant  execute on function public.claim_jobs(integer, integer)                to service_role;
grant  execute on function public.complete_job(uuid, uuid, boolean, text)     to service_role;
