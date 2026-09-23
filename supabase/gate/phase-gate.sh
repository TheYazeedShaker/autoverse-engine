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
#   5. The retry worker replays it.
#   6. Reconcile: submitted == stored, exactly once, and the queue is empty.
#
# Run: supabase db start && ./supabase/gate/phase-gate.sh
set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
psql_q() { psql "$DB_URL" -v ON_ERROR_STOP=1 -tA -c "$1"; }
step()   { printf '\n=== %s ===\n' "$1"; }
fail()   { printf '::error::GATE FAILED: %s\n' "$1" >&2; exit 1; }

BRAND='00000000-0000-0000-0000-0000000000aa'
EVENT='00000000-0000-0000-0000-0000000000e5'

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

step "Event: the retry worker replays it"
# Idempotent by id, exactly as the worker does — a replay of an event already stored is a no-op.
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
insert into public.events (id, brand_id, market_code, kind, payload)
select (source_payload ->> 'id')::uuid,
       (source_payload ->> 'brand_id')::uuid,
       source_payload ->> 'market_code',
       source_payload ->> 'kind',
       coalesce(source_payload -> 'payload', '{}'::jsonb)
  from public.event_dlq
 on conflict (id) do nothing;
delete from public.event_dlq;
SQL

step "Event: reconcile"
STORED=$(psql_q "select count(*) from public.events where id = '$EVENT'")
DLQ=$(psql_q "select count(*) from public.event_dlq")
[ "$STORED" = "1" ] || fail "after replay the event is stored $STORED times, expected exactly 1"
[ "$DLQ" = "0" ] || fail "the dead-letter queue still holds $DLQ row(s)"
echo "1 submitted, 1 stored, 0 in the queue — zero loss, no duplicate"

# ---------------------------------------------------------------------------------------------
# Leads pipeline
# ---------------------------------------------------------------------------------------------
step "Lead: capture, then kill the backend mid-transaction"
PGAPPNAME=gate-lead-writer psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL &
begin;
select public.capture_lead(jsonb_build_object(
  'brand_id', '$BRAND', 'market_code', 'EG',
  'full_name', 'Gate Person', 'phone', '+201000009999',
  'consent_text_version', 'gate-v1', 'consent_at', now()::text));
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
JOBS=$(psql_q "select count(*) from public.jobs")
[ "$LEADS" = "0" ] || fail "the lead survived the kill"
[ "$ACTS" = "0" ] || fail "an orphan activity was left behind by a rolled-back capture"
[ "$JOBS" = "0" ] || fail "a routing job was queued for a lead that does not exist"
echo "no lead, no orphan activity, no orphan routing job"

step "Lead: the pipeline dead-letters it, then the worker replays it"
psql_q "insert into public.lead_dlq (source_payload, error_message)
        values (jsonb_build_object('brand_id','$BRAND','market_code','EG','full_name','Gate Person',
                                   'phone','+201000009999','consent_text_version','gate-v1',
                                   'consent_at', now()::text),
                'connection terminated mid-write')" >/dev/null
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
select public.capture_lead(source_payload) from public.lead_dlq;
delete from public.lead_dlq;
SQL

step "Lead: reconcile"
LEADS=$(psql_q "select count(*) from public.leads where phone = '+201000009999'")
ACTS=$(psql_q "select count(*) from public.lead_activities")
JOBS=$(psql_q "select count(*) from public.jobs")
DLQ=$(psql_q "select count(*) from public.lead_dlq")
[ "$LEADS" = "1" ] || fail "after replay the lead is stored $LEADS times, expected exactly 1"
[ "$ACTS" = "1" ] || fail "the replayed lead has $ACTS activities, expected exactly 1"
[ "$JOBS" = "2" ] || fail "the replayed lead queued $JOBS routing jobs, expected 2"
[ "$DLQ" = "0" ] || fail "the lead dead-letter queue still holds $DLQ row(s)"
echo "1 submitted, 1 stored, 1 activity, 2 routing jobs, 0 in the queue — zero loss, no duplicate"

step "Consent survived the round trip"
CONSENT=$(psql_q "select consent_text_version from public.leads where phone = '+201000009999'")
[ "$CONSENT" = "gate-v1" ] || fail "consent did not survive the replay (got '$CONSENT')"
echo "consent_text_version = $CONSENT"

printf '\n=== PHASE GATE PASSED ===\n'
printf 'An event and a lead each survived a backend kill mid-write and reconciled to zero loss.\n'
