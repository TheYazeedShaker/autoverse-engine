-- 20260922235103_jobs.sql
-- ENGINE-CORE-1A Slice 9 — the job queue.
--
-- Everything that happens after a write and must survive a crash goes through this table: notifying
-- a brand about a lead, delivering a webhook, draining a dead-letter queue. The rule from the spec
-- is that every job kind is idempotent, because a worker that dies mid-job will run it again.
--
-- Claiming is the part worth getting right. `for update skip locked` lets several workers pull from
-- the same queue without ever handing the same row to two of them, and without one slow job
-- blocking the rest.

create type job_status as enum ('pending', 'running', 'done', 'failed');

create table public.jobs (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null,
  payload       jsonb not null default '{}'::jsonb,
  status        job_status not null default 'pending',
  attempts      integer not null default 0,
  max_attempts  integer not null default 5,
  run_after     timestamptz not null default now(),
  last_error    text,
  -- Optional: what this job is about, so a repeat enqueue of the same work collapses instead of
  -- sending a brand the same email twice.
  dedupe_key    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint jobs_kind_format check (kind ~ '^[a-z][a-z0-9-]{0,62}$'),
  constraint jobs_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint jobs_attempts_non_negative check (attempts >= 0),
  constraint jobs_max_attempts_positive check (max_attempts > 0)
);

-- The same outstanding work is enqueued once. Completed and failed rows are excluded so the same
-- key can legitimately come round again later (tomorrow's digest, a second lead for the same brand).
create unique index jobs_outstanding_dedupe_key
  on public.jobs (kind, dedupe_key)
  where dedupe_key is not null and status in ('pending', 'running');

create index jobs_runnable_idx on public.jobs (run_after) where status = 'pending';

create trigger jobs_set_updated_at before update on public.jobs
  for each row execute function app_auth.set_updated_at();

-- ---------- claiming ----------
-- One statement, so two workers cannot claim the same row: the update locks the rows the subselect
-- picked, and `skip locked` sends a competing worker straight past them to the next ones.
create or replace function public.claim_jobs(batch_size integer default 10)
returns setof public.jobs
language sql
security definer
set search_path = ''
as $fn$
  update public.jobs j
     set status = 'running',
         attempts = j.attempts + 1,
         updated_at = now()
   where j.id in (
     select id from public.jobs
      where status = 'pending' and run_after <= now()
      order by run_after
      limit greatest(batch_size, 1)
      for update skip locked
   )
  returning j.*;
$fn$;

-- Finishing a job: done, or back to pending with a backoff, or failed for good once it has used up
-- its attempts. Kept in the database so every worker retries the same way.
create or replace function public.complete_job(job_id uuid, succeeded boolean, error_text text default null)
returns public.jobs
language plpgsql
security definer
set search_path = ''
as $fn$
declare result public.jobs%rowtype;
begin
  if succeeded then
    update public.jobs set status = 'done', last_error = null
     where id = job_id returning * into result;
  else
    update public.jobs
       set status = case when attempts >= max_attempts then 'failed' else 'pending' end,
           -- Exponential backoff: 2s, 4s, 8s… so a struggling downstream is not hammered.
           run_after = now() + (power(2, least(attempts, 10)) * interval '1 second'),
           last_error = error_text
     where id = job_id returning * into result;
  end if;

  if result.id is null then
    raise exception 'job % does not exist', job_id;
  end if;
  return result;
end $fn$;

revoke execute on function public.claim_jobs(integer)                        from public, anon, authenticated;
revoke execute on function public.complete_job(uuid, boolean, text)          from public, anon, authenticated;
grant  execute on function public.claim_jobs(integer)                        to service_role;
grant  execute on function public.complete_job(uuid, boolean, text)          to service_role;

-- ---------- RLS ----------
alter table public.jobs enable row level security;

-- The queue is operational: staff can see what is stuck, nobody else reads it, and only the service
-- role writes. Payloads can carry a lead's details, so there is no brand-facing read path.
create policy jobs_staff_read on public.jobs
  for select using ((select app_auth.is_autoverse_staff()));

revoke insert, update, delete, truncate on public.jobs from anon, authenticated;

-- ---------- capture_lead now enqueues routing ----------
-- Slice 8 left this out because the queue did not exist yet. Routing is enqueued inside the same
-- transaction as the lead: if the lead is stored, the notification is guaranteed to be queued, and
-- if the capture rolls back, no notification is left behind for a lead that never existed.
create or replace function public.capture_lead(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  new_lead public.leads%rowtype;
  consent_version text := payload ->> 'consent_text_version';
  consent_moment  timestamptz;
begin
  if consent_version is null or length(btrim(consent_version)) = 0 then
    raise exception 'consent_text_version is required' using errcode = 'check_violation';
  end if;
  if (payload ->> 'consent_at') is null then
    raise exception 'consent_at is required' using errcode = 'check_violation';
  end if;
  consent_moment := (payload ->> 'consent_at')::timestamptz;

  insert into public.leads (
    brand_id, market_code, full_name, phone, city, model_id, trim_id,
    preferred_time, type, consent_text_version, consent_at, session_id
  )
  values (
    (payload ->> 'brand_id')::uuid,
    payload ->> 'market_code',
    payload ->> 'full_name',
    payload ->> 'phone',
    payload ->> 'city',
    nullif(payload ->> 'model_id', '')::uuid,
    nullif(payload ->> 'trim_id', '')::uuid,
    payload ->> 'preferred_time',
    coalesce((payload ->> 'type')::public.lead_type, 'contact'),
    consent_version,
    consent_moment,
    nullif(payload ->> 'session_id', '')::uuid
  )
  returning * into new_lead;

  insert into public.lead_activities (brand_id, lead_id, actor_id, kind, payload)
  values (
    new_lead.brand_id, new_lead.id, null, 'note',
    jsonb_build_object(
      'event', 'captured',
      'consent_text_version', consent_version,
      'consent_at', consent_moment,
      'source', coalesce(payload ->> 'source', 'consumer-form')
    )
  );

  -- Routing. The dedupe key is the lead id, so a replay of the same lead cannot email a brand twice.
  insert into public.jobs (kind, payload, dedupe_key)
  values
    ('notify-lead-email',    jsonb_build_object('lead_id', new_lead.id), new_lead.id::text),
    ('deliver-lead-webhook', jsonb_build_object('lead_id', new_lead.id), new_lead.id::text);

  return new_lead.id;
end $fn$;

revoke execute on function public.capture_lead(jsonb) from public, anon, authenticated;
grant execute on function public.capture_lead(jsonb) to service_role;
