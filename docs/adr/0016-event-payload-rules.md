# 0016 — event payloads: 8 KB, refused when larger, never PII

**Status:** accepted — 2026-09-25 (owner, `#build-decisions`, BLOCK-FIX-9)

## Context

BLOCK finding #9 (PROGRESS.md, 1·A BLOCK review): an event's `payload` was
`z.record(z.string(), z.unknown())` with no size cap, and `events` is write-once, so nothing in it
can be trimmed or scrubbed later. A batch was capped at 100 events but not in bytes. An event that
failed validation went into `event_dlq` unchanged, so a limit checked only at the edge would still
have stored the oversized body there.

## Decision

- **8 KB per payload, serialized.** Enforced twice:
  - in Zod (`services/ingest-event/ingest.ts`), for the edge function and the worker's dead-letter
    replays;
  - by the CHECK `events_payload_size` (`octet_length(payload::text) <= 8192`), so it holds for
    every writer. Postgres renders `jsonb` with a space after each `:` and `,`, so near the limit
    the database is slightly stricter than Zod, and it has the final say.
- **Oversized events are refused, never dead-lettered.** Oversized means a payload over 8 KB, or
  the event as a whole over 9 KB (the payload plus 1 KB for ids and kind). The second limit exists
  because an event that fails validation is dead-lettered verbatim, so its bulk could otherwise
  sit in another field. `ingest-event` answers **413**, and nothing is written anywhere. That
  applies to a single event or a batch holding one; an oversized event makes the whole request
  fail.
  - The edge function refuses before calling the database, so that 413 costs only edge compute,
    and no rate-limit budget, like a body that isn't JSON.
  - `ingest_events_public` checks again, for callers that reach it directly and for payloads the
    database measures as larger than Zod did. It refuses before writing anything, returning
    `refused: payload_too_large` rather than raising, so that refusal does spend rate-limit budget.
  - The job worker gives up at once on an oversized dead letter (it fails validation), and on a
    replay the database refuses with the CHECK (23514), instead of retrying it five times.
- **256 KB per request body** to `ingest-event`, counted on the stream, not trusted from
  `Content-Length`. 413 when over.
- **Event payloads never carry PII.** Names, phones, emails and anything else that identifies a
  person belong only in `leads`, which has consent, RLS and an erasure story. An event carries ids,
  option codes, counts and timings. Enforcing this by content isn't possible with a free-form
  record; per-kind schemas (below) are how it becomes enforceable.

## Observability

- Every refusal logs `events_refused_too_large` at warn, with `trace_id`, `reason` (`body`,
  `payload`, `event`, or `payload_db` when the database refused), the measured `bytes` where
  known, and the market. Never any content.
- **Alert:** `events_refused_too_large` above a threshold per market. Proposed: more than 20 in 15
  minutes. That number is the agent's starting point, not the owner's; the owner confirms or
  changes it. A page that
  suddenly sends oversized events is a sender regression, and until it's fixed those events are
  lost. Ops is notified, not paged: no lead is involved. It's a log-based alert on that event name,
  set up with the other log alerts when the log drain goes live.
- Oversized dead letters the worker gives up on log `event_dlq_gave_up` with the reason, like any
  other give-up.

## Alternatives considered

- **32 KB per payload** (option B): room for full configurator state snapshots. Rejected: a large
  snapshot belongs in stored media referenced by id, not in a write-once event row.
- **A schema per event kind** (option C): allowed payload keys and types per `kind`, in
  `packages/types`. The strongest control, and the only one that can enforce "no PII". Deferred,
  not rejected: it is queued in `BACKLOG.md` for when page event capture lands (it builds on this
  ADR, it doesn't replace it; the `add-analytics-event` skill is where each kind's schema is added).
- **Dead-lettering oversized events** like other invalid ones: rejected, because the dead-letter
  queue would then keep exactly the bodies the cap exists to keep out.

## Consequences

- A client that sends an oversized payload loses that whole request and is told why (413). That is
  deliberate: it's a bug in the sender, and silent partial acceptance would hide it.
- A malformed event (bad id, bad kind) under both limits is still dead-lettered verbatim, as
  before.
- `event_dlq` itself has no size CHECK. The limit holds there because `ingest_events_public` is the
  only path that writes new rows into it from outside. Adding one would first need a hosted check
  of existing dead letters. Dead letters written before this change aren't purged; an oversized
  one is now given up on at once.
- "No PII in events" is a rule reviewers enforce until per-kind schemas exist. Until then an
  event with PII can't be removed without breaking the write-once guarantee.
