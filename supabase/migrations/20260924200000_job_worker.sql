-- 20260924200000_job_worker.sql
-- ENGINE-CORE-1A Slice 9 — what the job worker needs from the database.
--
-- The review found both dead-letter queues write-only (BLOCK #2): nothing drained them. The worker
-- (services/job-worker) now does. Two changes make that safe:
--
--   * A dead letter is RESOLVED, not deleted. "Any row here is an incident", and an incident that
--     disappears once fixed leaves no record that it happened. resolved_at marks the replay; the
--     row and its payload stay for the audit trail. The pending indexes now skip resolved rows.
--
--   * Draining runs as a job, so it inherits the queue's guarantees. enqueue_dlq_sweeps() puts a
--     retry-event-dlq / retry-lead-dlq job on the queue when there is anything to drain. The fixed
--     dedupe key 'sweep' means at most one sweep per queue is outstanding. A dead worker's sweep
--     is reaped by its lease like any other job, so two workers never replay the same dead letter
--     at once.
--
-- No table is added, so no new RLS surface: both queues keep their staff-only read policies and
-- service-role-only writes.

alter table public.event_dlq add column resolved_at timestamptz;
alter table public.lead_dlq  add column resolved_at timestamptz;

-- error_message keeps the ORIGINAL failure (why it was dead-lettered). A failed replay records its
-- own reason here instead, so the first cause is never overwritten.
alter table public.event_dlq add column last_error text;
alter table public.lead_dlq  add column last_error text;

drop index public.event_dlq_pending_idx;
drop index public.lead_dlq_pending_idx;
create index event_dlq_pending_idx on public.event_dlq (created_at) where resolved_at is null and attempts < 5;
create index lead_dlq_pending_idx  on public.lead_dlq  (created_at) where resolved_at is null and attempts < 5;

create or replace function public.enqueue_dlq_sweeps()
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare queued integer := 0; n integer;
begin
  if exists (select 1 from public.event_dlq where resolved_at is null and attempts < 5) then
    insert into public.jobs (kind, payload, dedupe_key)
    values ('retry-event-dlq', '{}'::jsonb, 'sweep')
    on conflict do nothing;
    get diagnostics n = row_count;
    queued := queued + n;
  end if;

  if exists (select 1 from public.lead_dlq where resolved_at is null and attempts < 5) then
    insert into public.jobs (kind, payload, dedupe_key)
    values ('retry-lead-dlq', '{}'::jsonb, 'sweep')
    on conflict do nothing;
    get diagnostics n = row_count;
    queued := queued + n;
  end if;

  return queued;
end $fn$;

revoke execute on function public.enqueue_dlq_sweeps() from public, anon, authenticated;
grant  execute on function public.enqueue_dlq_sweeps() to service_role;
