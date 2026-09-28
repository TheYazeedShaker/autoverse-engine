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
3. **Rate limit.** Per client: an HMAC of the address with `CLIENT_HASH_SECRET`, never a raw or
   plainly hashed IP. The address is the one our proxies recorded (`cf-connecting-ip`, then
   `x-real-ip`, then the last `x-forwarded-for` hop), never the first hop the client wrote. Kept in
   Postgres (`app_auth.rate_limit_hits`, unreadable by anon).
   - Leads: 5 per client per 10 minutes. The per-brand count (1000 per 10 minutes) **never refuses a
     lead**. Data capture is never gated, and a hard brand cap would let one attacker block a
     brand's genuine leads. Going over it raises a database warning (`public_capture_brand_surge`)
     that can be alerted on.
   - Events: 300 per client and 20,000 per brand per minute, counted **per event** (a call carries
     up to 100).
   - A refused lead (the sender's mistake) is returned as `rejected`, not raised, so its rate-limit
     hit is kept. Otherwise failed attempts would be free.

Lead capture adds **Cloudflare Turnstile** in the edge function before any of that. It fails
closed, and refuses a token solved on a hostname other than the page's origin. Tokens are
single-use, so a form retrying after a 503 must get a fresh one.

Rollout order (secrets before traffic): `docs/runbooks/public-capture-rollout.md`.

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

## Amendment — CORS (2026-09-28, slice 7 of `PAGE-CONSUMER-SHOWROOM`)

A brand page calls `capture-lead` (and, from slice 9, `ingest-event`) straight from the browser.
The contract's custom headers make the browser send a preflight `OPTIONS` first; both functions
answered it with 405 and no CORS headers, so no browser could ever submit.

Both now answer the preflight with 204 (methods `POST, OPTIONS`; headers `content-type`,
`x-autoverse-key`, `x-autoverse-market`, `x-trace-id`; max-age 600 s) and put
`access-control-allow-origin: *` on every answer (`services/shared/cors.ts`).

- **`*`, not a reflected origin.** CORS is not the access control here: the database admits a
  caller only when key, `Origin` and market match a live brand-market's allowlist, and a
  non-browser client ignores CORS anyway. The function can't know the allowlist without a database
  call, and a preflight must not make one.
- **No credentials.** Neither function reads cookies, so `allow-credentials` is never sent (it is
  invalid with `*` in any case).
- **Every answer means every answer.** Each function's handler runs inside one try/catch, so an
  unexpected throw leaves as a logged 503 (`lead_unhandled_error` pages; `events_unhandled_error`)
  with the CORS header, never as the runtime's bare 500 the page can't read. `Origin: null`, the
  one throw a browser could trigger (sandboxed frames, some redirects), is now refused as no
  caller (403) before anything parses it.
- **The trace id is checked.** `X-Trace-Id` is caller-controlled and goes into every log line and
  the response, so it is kept only if it matches `^[A-Za-z0-9-]{8,64}$`; otherwise a fresh UUID is
  minted (no free text, PII or huge values in logs). Answers also carry `nosniff`.
- **Preflights are not logged.** They carry no body and do nothing, and max-age 600 s keeps them
  rare per visitor, so a line per preflight would be noise. A CORS break shows up as missing
  `lead_captured` lines and the consumer's own client-side failure report (slice 7).
- **Follow-up (security review, predates this change):** capture-lead calls Turnstile before the
  database admits the caller, so any request with well-formed headers costs one outbound Turnstile
  call. With `*`, any site can make its visitors' browsers do that. No data is exposed; the cost is
  load and Turnstile quota. A cheap per-address limit ahead of the Turnstile call is the fix.
- **Rejected: a same-origin proxy in the consumer app.** The function would then see the app
  server's address, not the visitor's, which breaks the per-visitor rate limit and Turnstile's
  `remoteip`, and the `Origin` check would be vouched for by our own server instead of the browser.
