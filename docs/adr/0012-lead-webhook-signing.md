# 0012 — lead webhooks are signed with HMAC-SHA256, per brand-market secret in Vault

**Status:** accepted — 2026-09-24 (owner, `#build-decisions`). Brands integrate against this, so
changing it needs a new ADR and a versioned header.

## Context

engine-architecture §10 says outbound webhooks per brand are "signed, retried, replayable".
`brand_market_private.lead_routing_webhook_url` existed, but there was no secret and no scheme.

## Decision

**Secret.** Each (brand, market) has its own signing secret, stored in Supabase **Vault**.
`brand_market_private.lead_routing_webhook_secret_id` references the Vault entry. The secret never
sits in a table row, a dump or a log. Rotating it means writing a new Vault secret and repointing
the reference.

**Request.** `POST` to the brand-market's webhook URL, `Content-Type: application/json`, with:

| Header                  | Value                                             |
| ----------------------- | ------------------------------------------------- |
| `X-Autoverse-Timestamp` | Unix seconds when the request was signed          |
| `X-Autoverse-Signature` | `v1=` + lower-case hex HMAC-SHA256 (see below)    |
| `X-Autoverse-Delivery`  | The job id: stable across retries of one delivery |

**Signature.** `HMAC_SHA256(secret, "<timestamp>.<raw request body>")`, hex-encoded, prefixed `v1=`.

**Receivers must:**

1. Recompute the signature over the **raw** body bytes and compare it in constant time.
2. **Reject any timestamp older than 5 minutes** (or more than 5 minutes in the future). This is
   the replay protection. A captured request can't be re-sent later.
3. Treat `X-Autoverse-Delivery` as an idempotency key. A retry delivers the same lead again with
   the same delivery id, and must not create a second record.

**Delivery.** A 10-second timeout per attempt. Any 2xx counts as delivered. Anything else, or a
timeout, is retried by the job queue with exponential backoff up to 5 attempts, then `failed` and
visible to staff. The body is the lead as captured (the brand's own customer data, sent to the
brand's own endpoint). It is never logged.

## Consequences

- A leaked secret affects one brand-market only, and is rotated without a deploy.
- The `v1=` prefix leaves room for a future scheme without breaking existing receivers.
- A brand with no webhook URL configured simply has nothing to deliver. The job completes as a no-op.
