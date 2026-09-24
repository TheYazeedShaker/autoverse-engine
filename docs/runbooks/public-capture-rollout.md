# Runbook — turn on public capture (ingest-event, capture-lead)

**When:** the first time these functions go live on a project, and again for any new brand-market.
**Why the order matters:** both functions fail **closed**. With a secret missing they answer 503
and log `capture_misconfigured`. With the gateway secret mismatched, every request is a 403. Set
everything before the functions receive traffic. ADR 0013 explains the design.

## 1. Secrets (once per project)

Generate each random value locally with `openssl rand -hex 32`. Never paste one into chat, Slack
or a ticket.

| Where                    | Name                             | Value                                    |
| ------------------------ | -------------------------------- | ---------------------------------------- |
| Edge Functions → Secrets | `CAPTURE_GATEWAY_SECRET`         | random value **G**                       |
| Database → Vault         | `capture_gateway_secret`         | the same value **G**                     |
| Edge Functions → Secrets | `CLIENT_HASH_SECRET`             | a second random value                    |
| Edge Functions → Secrets | `TURNSTILE_SECRET_KEY`           | the Turnstile widget's secret key        |
| Vercel (consumer app)    | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | the Turnstile widget's site key (public) |

In Cloudflare, list every brand domain in the widget's hostname list. capture-lead refuses a token
solved on any other hostname.

## 2. Per brand-market (admin, service role)

1. Set `brand_markets.allowed_origins` to the exact origins the pages are served from:
   `https://…`, no path. `http://localhost` is only accepted while the market isn't live.
2. The brand must be `status = 'live'` and the market `live = true`. Otherwise nothing resolves.
3. Issue a key once per brand: `select public.issue_publishable_key('<brand_id>', 'web');`. It is
   public by design and goes in the page bundle.

## 3. Deploy

Deploy `ingest-event` and `capture-lead`. (`supabase functions deploy` is a hosted action, so
it's the owner's to run.)

## 4. Verify

- A request with no `X-Autoverse-Key` gets 403, and `lead_refused_no_caller` is logged.
- A lead from the brand's page (valid Turnstile token, headers `X-Autoverse-Key` and
  `X-Autoverse-Market`) gets 201 `{status: "received"}`, and the lead appears for that brand.
- The same request from a different origin gets 403.
- No `capture_misconfigured` lines in the Edge Function logs.

## Page contract (for the consumer app)

- Headers: `X-Autoverse-Key: pk_…`, `X-Autoverse-Market: EG`. The browser sets `Origin`.
- Lead body: the form fields, a `submission_id` minted once per submit and **reused on retry**,
  and `turnstile_token`. A Turnstile token is single-use, so a retry needs a fresh one.
- Answers: 201 received · 403 not authorized / verification failed · 409 submission id reused ·
  422 invalid · 429 too many · 503 try again.
