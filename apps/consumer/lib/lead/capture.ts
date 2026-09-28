import { PageLeadSubmission } from "./schema";

// The lead submit: the page contract of docs/runbooks/public-capture-rollout.md, exactly. Pure (every
// effect is a dependency), so the contract is unit tested without a browser.
//
//   - POST to capture-lead with X-Autoverse-Key (the brand's publishable key), X-Autoverse-Market
//     and X-Trace-Id (one per submit, the same on every retry, so the attempts join in the logs).
//   - The body: the form fields, the submission_id (minted by the caller ONCE per submit and reused
//     on every retry: it is the idempotency key), and a turnstile_token that is FRESH per attempt
//     (tokens are single-use).
//   - 201 received · 403 not authorized / verification failed · 409 submission id reused ·
//     422 invalid · 429 too many · 503 try again. 503, a gateway 502/504, a timeout or a network
//     error is retried with backoff, same submission_id; a retry is safe because capture is
//     idempotent on it. Nothing else is retried.
//
// The body is parsed with the page's Zod schema (schema.ts) before anything is sent: a payload the
// page itself built wrong is our bug, reported as "unexpected" (status 0) and never sent.
//
// Leads are synchronous and acknowledged (CLAUDE.md): only a 201 is success. Every other outcome is
// reported to the caller, which shows it and reports failures (no PII: outcome, status, attempts).

export type { LeadType, PreferredTime } from "./schema";

/** What the form sends, minus the Turnstile token (added per attempt). Validated before sending. */
export type LeadSubmission = PageLeadSubmission;

export type CaptureOutcome =
  | { kind: "received"; attempts: number }
  | { kind: "verification_failed"; attempts: number }
  | { kind: "duplicate"; attempts: number }
  | { kind: "invalid"; attempts: number }
  | { kind: "rate_limited"; attempts: number }
  | { kind: "unavailable"; attempts: number }
  | { kind: "unexpected"; status: number; attempts: number };

export interface CaptureDeps {
  /** capture-lead's URL. */
  url: string;
  /** The brand's publishable key (showroom_catalog.capture_key). */
  captureKey: string;
  marketCode: string;
  traceId: string;
  /** A fresh bot-check token, or null when the check couldn't produce one. */
  getToken: () => Promise<string | null>;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  /** Called before each retry, with the attempt about to start (2, 3, …). */
  onRetry?: (attempt: number) => void;
  maxAttempts?: number;
  /** Waits before attempts 2, 3, 4… (the last value repeats). */
  backoffMs?: readonly number[];
  timeoutMs?: number;
}

export const CAPTURE_MAX_ATTEMPTS = 4;
export const CAPTURE_BACKOFF_MS = [1000, 2000, 4000] as const;
// capture-lead allows 5 s for Turnstile and 10 s for the database.
export const CAPTURE_TIMEOUT_MS = 20_000;

const RETRYABLE = new Set([502, 503, 504]);

export async function submitLead(
  submission: LeadSubmission,
  deps: CaptureDeps,
): Promise<CaptureOutcome> {
  const maxAttempts = deps.maxAttempts ?? CAPTURE_MAX_ATTEMPTS;
  const backoff = deps.backoffMs ?? CAPTURE_BACKOFF_MS;
  const timeoutMs = deps.timeoutMs ?? CAPTURE_TIMEOUT_MS;
  const parsed = PageLeadSubmission.safeParse(submission);
  if (!parsed.success) return { kind: "unexpected", status: 0, attempts: 0 };
  const body = parsed.data;

  for (let attempt = 1; ; attempt++) {
    const token = await deps.getToken();
    if (!token) return { kind: "verification_failed", attempts: attempt };

    let status: number | null = null;
    try {
      const res = await deps.fetch(deps.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-autoverse-key": deps.captureKey,
          "x-autoverse-market": deps.marketCode,
          "x-trace-id": deps.traceId,
        },
        body: JSON.stringify({ ...body, turnstile_token: token }),
        signal: AbortSignal.timeout(timeoutMs),
        // No cookies: the function reads none (ADR 0013, CORS amendment).
        credentials: "omit",
      });
      status = res.status;
    } catch {
      status = null; // network error, CORS failure or timeout: retryable
    }

    switch (status) {
      case 201:
        return { kind: "received", attempts: attempt };
      case 403:
        return { kind: "verification_failed", attempts: attempt };
      case 409:
        return { kind: "duplicate", attempts: attempt };
      case 400:
      case 422:
        return { kind: "invalid", attempts: attempt };
      case 429:
        return { kind: "rate_limited", attempts: attempt };
    }
    if (status !== null && !RETRYABLE.has(status)) {
      return { kind: "unexpected", status, attempts: attempt };
    }
    if (attempt >= maxAttempts) return { kind: "unavailable", attempts: attempt };
    await deps.sleep(backoff[Math.min(attempt - 1, backoff.length - 1)] ?? 0);
    deps.onRetry?.(attempt + 1);
  }
}
