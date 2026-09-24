# 0013 — public capture runs on the anon key, through two gated database functions

**Status:** accepted — 2026-09-24 (owner, `#build-decisions`)

## Context

Production plan §3.1 (Blocking) says the service-role key is "never present in any … Edge Function
reachable by an anonymous caller". `ingest-event` and `capture-lead` are exactly that, and both
used it. They also took `brand_id` from the request body, so any caller could write into any
brand (1·A BLOCK #1).

## Decision

The public edge functions hold **no service-role key**. They call the database with the **anon
key**, and anon can execute exactly two `SECURITY DEFINER` functions,
`public.capture_lead_public` and `public.ingest_events_public`, each with `search_path` pinned.
Inside, a shared admission gate (`app_auth.admit_public_call`) does, in order:

1. **Gateway secret.** The call must carry `CAPTURE_GATEWAY_SECRET`, which only the edge functions
   hold (the database reads it from Vault as `capture_gateway_secret`). The anon key is public, so
   without this anyone could call the functions directly and skip the bot check.
2. **Caller → brand.** The publishable key, `Origin` and `X-Autoverse-Market` resolve to a brand
   and market (`app_auth.resolve_public_caller`). The key must be live, the brand live, the named
   market live, and the origin on that market's allowlist. The body's `brand_id` and
   `market_code` are discarded.
3. **Rate limit.** Per client (an HMAC of the address with `CLIENT_HASH_SECRET`, never a raw or
   plainly hashed IP) and per brand, in Postgres (`app_auth.rate_limit_hits`, unreadable by anon).
   Leads: 5 per client and 300 per brand per 10 minutes. Events: 300 per client and 20,000 per
   brand per minute.

Lead capture adds **Cloudflare Turnstile** in the edge function before any of that, and fails
closed.

A refusal is always the same generic answer (403, or 429 for a rate limit), so a caller never
learns which check failed. An anonymous caller is never handed a lead id.

## What this does and doesn't stop

- **Stops:** writing into a brand whose key you don't hold. Using a lifted key from another site
  in a browser. Calling the database directly around the edge function. Floods from one client,
  and from many clients against one brand.
- **Doesn't stop by itself:** a script that sends a brand's own public key and a forged `Origin`.
  For leads, Turnstile is what stops that. For events, the rate limit caps the damage. Events carry
  no PII and every aggregate is rebuildable.

## Consequences

- The service role now exists only in CI migrations and server-side jobs (the job worker), as
  §3.1 requires.
- The edge functions can no longer write the dead-letter queues directly. The database functions
  dead-letter on their behalf, so the "stored or dead-lettered" guarantee holds. If the database is
  unreachable, the edge function answers 503 and the client retries (safe: events are idempotent
  on id, leads on `submission_id`).
- Two new edge secrets (`CAPTURE_GATEWAY_SECRET`, `CLIENT_HASH_SECRET`), one Vault entry
  (`capture_gateway_secret`, the same value as the gateway secret), and `TURNSTILE_SECRET_KEY`.
