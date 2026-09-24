#!/usr/bin/env bash
# ENGINE-CORE-1A phase gate.
#
# "An event and a lead must each survive an induced failure (SIGKILL mid-write) and reconcile to
# zero loss." This script does that against a real Postgres carrying every migration:
#
#   1. Open a transaction, write, and hold it.
#   2. Kill that backend from another session — pg_terminate_backend is what SIGKILL looks like to
#      Postgres: the connection dies mid-transaction and the work is rolled back.
#   3. Prove the write is genuinely gone. A gate that passes because nothing was lost proves nothing.
#   4. The pipeline dead-letters the payload it could not store, exactly as the edge function does.
#   5. THE JOB WORKER replays it: services/job-worker, over the real supabase-js store, through the
#      API. The gate does not touch the dead letter itself. The worker queues its own sweep, claims
#      it under a lease, replays, and marks the row resolved.
#   6. Reconcile: submitted == stored, exactly once, no unresolved dead letter, and the audit row
#      kept.
#
# What this still stands in for: step 4's dead-letter insert (the edge function's failure branch)
# is written directly. Everything after it is the production code path.
#
# Needs the API as well as Postgres (supabase start). The worker finds it through API_URL and
# SERVICE_ROLE_KEY, the names `supabase status -o env` prints for the local stack:
#
# Run: supabase start && eval "$(supabase status -o env | sed 's/^/export /')" && ./supabase/gate/phase-gate.sh
set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
psql_q() { psql "$DB_URL" -v ON_ERROR_STOP=1 -tA -c "$1"; }
step()   { printf '\n=== %s ===\n' "$1"; }
fail()   { printf '::error::GATE FAILED: %s\n' "$1" >&2; exit 1; }

: "${API_URL:?the worker needs API_URL from supabase status (see the header)}"
: "${SERVICE_ROLE_KEY:?the worker needs SERVICE_ROLE_KEY from supabase status (see the header)}"
run_worker() { pnpm --silent --filter @autoverse/job-worker exec tsx run-once.ts; }

BRAND='00000000-0000-0000-0000-0000000000aa'
EVENT='00000000-0000-0000-0000-0000000000e5'
SUBMISSION='00000000-0000-0000-0000-0000000000f5'

step "Seed a brand and a market"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
insert into public.brands (id, slug, name) values ('$BRAND', 'gate-brand', 'Gate Brand')
  on conflict (id) do nothing;
insert into public.brand_markets (brand_id, market_code, currency, locale, live)
  values ('$BRAND', 'EG', 'EGP', 'ar-EG', true)
  on conflict (brand_id, market_code) do nothing;
SQL

# ---------------------------------------------------------------------------------------------
# Event pipeline
# ---------------------------------------------------------------------------------------------
step "Event: write, then kill the backend mid-transaction"
PGAPPNAME=gate-event-writer psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL &
begin;
insert into public.events (id, brand_id, market_code, kind, payload)
values ('$EVENT', '$BRAND', 'EG', 'configurator.opened', '{"gate": true}'::jsonb);
select pg_sleep(20);
commit;
SQL
WRITER_PID=$!
sleep 3

KILLED=$(psql_q "select count(*) from (
  select pg_terminate_backend(pid) from pg_stat_activity
   where application_name = 'gate-event-writer' and pid <> pg_backend_pid()
) t")
wait "$WRITER_PID" 2>/dev/null || true
[ "$KILLED" -ge 1 ] || fail "no backend was killed — the induced failure did not happen"
echo "killed $KILLED backend(s) mid-write"

step "Event: prove the write is gone"
STORED=$(psql_q "select count(*) from public.events where id = '$EVENT'")
[ "$STORED" = "0" ] || fail "the event survived the kill, so nothing was actually induced"
echo "events table holds 0 rows for this id — the write was lost, as intended"

step "Event: the pipeline dead-letters what it could not store"
psql_q "insert into public.event_dlq (source_payload, error_message)
        values (jsonb_build_object('id','$EVENT','brand_id','$BRAND','market_code','EG',
                                   'kind','configurator.opened','payload', jsonb_build_object('gate', true)),
                'connection terminated mid-write')" >/dev/null
DLQ=$(psql_q "select count(*) from public.event_dlq")
[ "$DLQ" = "1" ] || fail "the dead letter was not recorded (found $DLQ)"
echo "event_dlq holds 1 row"

step "Event: the job worker replays it"
run_worker

step "Event: reconcile"
STORED=$(psql_q "select count(*) from public.events where id = '$EVENT'")
OPEN=$(psql_q "select count(*) from public.event_dlq where resolved_at is null")
KEPT=$(psql_q "select count(*) from public.event_dlq where resolved_at is not null")
[ "$STORED" = "1" ] || fail "after replay the event is stored $STORED times, expected exactly 1"
[ "$OPEN" = "0" ] || fail "the worker left $OPEN unresolved dead letter(s)"
[ "$KEPT" = "1" ] || fail "the resolved dead letter was not kept for the audit trail"
echo "1 submitted, 1 stored, 0 unresolved, 1 resolved incident kept — zero loss, no duplicate"

# ---------------------------------------------------------------------------------------------
# Leads pipeline
# ---------------------------------------------------------------------------------------------
step "Lead: capture, then kill the backend mid-transaction"
PGAPPNAME=gate-lead-writer psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL &
begin;
select public.capture_lead(jsonb_build_object(
  'brand_id', '$BRAND', 'market_code', 'EG',
  'full_name', 'Gate Person', 'phone', '+201000009999',
  'consent_text_version', 'gate-v1', 'consent_at', now()::text,
  'submission_id', '$SUBMISSION'));
select pg_sleep(20);
commit;
SQL
WRITER_PID=$!
sleep 3

KILLED=$(psql_q "select count(*) from (
  select pg_terminate_backend(pid) from pg_stat_activity
   where application_name = 'gate-lead-writer' and pid <> pg_backend_pid()
) t")
wait "$WRITER_PID" 2>/dev/null || true
[ "$KILLED" -ge 1 ] || fail "no backend was killed for the lead"
echo "killed $KILLED backend(s) mid-capture"

step "Lead: prove nothing half-landed"
LEADS=$(psql_q "select count(*) from public.leads where phone = '+201000009999'")
ACTS=$(psql_q "select count(*) from public.lead_activities")
JOBS=$(psql_q "select count(*) from public.jobs where kind in ('notify-lead-email','deliver-lead-webhook')")
[ "$LEADS" = "0" ] || fail "the lead survived the kill"
[ "$ACTS" = "0" ] || fail "an orphan activity was left behind by a rolled-back capture"
[ "$JOBS" = "0" ] || fail "a routing job was queued for a lead that does not exist"
echo "no lead, no orphan activity, no orphan routing job"

step "Lead: the pipeline dead-letters it (twice: at-least-once), then the job worker replays it"
for _ in 1 2; do
  psql_q "insert into public.lead_dlq (source_payload, error_message)
          values (jsonb_build_object('brand_id','$BRAND','market_code','EG','full_name','Gate Person',
                                     'phone','+201000009999','consent_text_version','gate-v1',
                                     'consent_at', now()::text, 'submission_id', '$SUBMISSION'),
                  'connection terminated mid-write')" >/dev/null
done
run_worker
# A second run finds nothing left to do, and must not change anything.
run_worker

step "Lead: reconcile"
LEADS=$(psql_q "select count(*) from public.leads where phone = '+201000009999'")
ACTS=$(psql_q "select count(*) from public.lead_activities")
JOBS=$(psql_q "select count(*) from public.jobs where kind in ('notify-lead-email','deliver-lead-webhook')")
OPEN=$(psql_q "select count(*) from public.lead_dlq where resolved_at is null")
STUCK=$(psql_q "select count(*) from public.jobs where status = 'running'")
[ "$LEADS" = "1" ] || fail "after replay the lead is stored $LEADS times, expected exactly 1"
[ "$ACTS" = "1" ] || fail "the replayed lead has $ACTS activities, expected exactly 1"
[ "$JOBS" = "2" ] || fail "the replayed lead queued $JOBS routing jobs, expected 2"
[ "$OPEN" = "0" ] || fail "the worker left $OPEN unresolved lead dead letter(s)"
[ "$STUCK" = "0" ] || fail "$STUCK job(s) left running after the worker finished"
echo "2 dead letters for 1 submission → 1 stored, 1 activity, 2 routing jobs, 0 unresolved, 0 stuck"

step "Consent survived the round trip"
CONSENT=$(psql_q "select consent_text_version from public.leads where phone = '+201000009999'")
[ "$CONSENT" = "gate-v1" ] || fail "consent did not survive the replay (got '$CONSENT')"
echo "consent_text_version = $CONSENT"

step "Routing: attempted by the worker, not silently dropped"
psql_q "select kind || ' → ' || status || ' (' || coalesce(last_error, 'ok') || ')'
          from public.jobs where kind in ('notify-lead-email','deliver-lead-webhook') order by kind"

printf '\n=== PHASE GATE PASSED ===\n'
printf 'An event and a lead each survived a backend kill mid-write and were replayed by the job\n'
printf 'worker to zero loss, exactly once.\n'
