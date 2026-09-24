// Lead routing: tell the brand about a new lead, by email (Resend) and by signed webhook (ADR 0012).
//
// Both are retried by the job queue, so both must be safe to repeat:
//   * Resend receives an Idempotency-Key derived from the job id, so a retry within its window
//     cannot send a second email.
//   * The webhook carries X-Autoverse-Delivery (the job id), which receivers treat as their
//     idempotency key.
// The lead is PII. It goes to the brand's own inbox or endpoint and nowhere else: never into a log
// line, an error message, or a URL.
import type { LeadRouting } from "./store.ts";

export interface RoutingConfig {
  resendApiKey?: string;
  /** e.g. "Autoverse Leads <leads@example.com>". The domain must be verified in Resend. */
  leadEmailFrom?: string;
  fetch: typeof fetch;
  /** Milliseconds since the epoch. Injected so signing is testable. */
  now: () => number;
  timeoutMs: number;
}

export const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** A non-2xx or unreachable downstream. The message names the status only, never the body. */
export class DeliveryError extends Error {
  constructor(what: string, status?: number) {
    super(status === undefined ? `${what} unreachable` : `${what} answered ${status}`);
    this.name = "DeliveryError";
  }
}

async function post(
  config: RoutingConfig,
  what: string,
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<void> {
  let response: Response;
  try {
    response = await config.fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch {
    throw new DeliveryError(what);
  }
  if (!response.ok) throw new DeliveryError(what, response.status);
}

// ---------------------------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------------------------

const TYPE_LABEL: Record<string, string> = {
  test_drive: "Test drive",
  quote: "Quote",
  contact: "Contact",
  whatsapp: "WhatsApp",
};

export function leadEmail(lead: LeadRouting["lead"]): { subject: string; text: string } {
  const type = TYPE_LABEL[String(lead.type)] ?? String(lead.type);
  const line = (label: string, value: unknown) =>
    value === null || value === undefined || value === "" ? [] : [`${label}: ${String(value)}`];
  return {
    subject: `New lead · ${type} · ${lead.market_code}`,
    text: [
      `A new ${type.toLowerCase()} request has arrived.`,
      "",
      ...line("Name", lead.full_name),
      ...line("Phone", lead.phone),
      ...line("City", lead.city),
      ...line("Preferred time", lead.preferred_time),
      ...line("Market", lead.market_code),
      ...line("Received", lead.created_at),
      "",
      `Consent: version ${String(lead.consent_text_version)}, given ${String(lead.consent_at)}.`,
      `Reference: ${lead.id}`,
    ].join("\n"),
  };
}

/** Returns false when there is nobody to email: a brand-market with no recipients is a no-op. */
export async function sendLeadEmail(
  routing: LeadRouting,
  jobId: string,
  config: RoutingConfig,
): Promise<boolean> {
  if (routing.emails.length === 0) return false;
  if (!config.resendApiKey || !config.leadEmailFrom) {
    throw new Error("notify-lead-email is not configured: RESEND_API_KEY / LEAD_EMAIL_FROM unset");
  }
  const { subject, text } = leadEmail(routing.lead);
  await post(
    config,
    "resend",
    RESEND_ENDPOINT,
    {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `lead-email/${jobId}`,
    },
    JSON.stringify({ from: config.leadEmailFrom, to: routing.emails, subject, text }),
  );
  return true;
}

// ---------------------------------------------------------------------------------------------
// Webhook (ADR 0012)
// ---------------------------------------------------------------------------------------------

/** `v1=` + hex HMAC-SHA256(secret, "<timestamp>.<body>"). */
export async function signWebhook(
  secret: string,
  timestamp: number,
  body: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`));
  const hex = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
  return `v1=${hex}`;
}

/** Returns false when the brand-market has no webhook: nothing to deliver. */
export async function deliverLeadWebhook(
  routing: LeadRouting,
  jobId: string,
  config: RoutingConfig,
): Promise<boolean> {
  if (!routing.webhook_url) return false;
  if (!routing.webhook_secret) {
    // A URL without a secret would mean sending unsigned PII. Refuse, loudly, until it's set.
    throw new Error(
      "deliver-lead-webhook is not configured: this brand-market has no signing secret",
    );
  }
  const timestamp = Math.floor(config.now() / 1000);
  const body = JSON.stringify({ event: "lead.captured", delivery_id: jobId, lead: routing.lead });
  await post(
    config,
    "webhook",
    routing.webhook_url,
    {
      "Content-Type": "application/json",
      "X-Autoverse-Timestamp": String(timestamp),
      "X-Autoverse-Signature": await signWebhook(routing.webhook_secret, timestamp, body),
      "X-Autoverse-Delivery": jobId,
    },
    body,
  );
  return true;
}
