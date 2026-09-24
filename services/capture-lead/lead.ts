import { z } from "zod";

// Lead capture: the schema and the rejection rules. Pure, so they are unit tested directly.
//
// Leads are stricter than events by design (CLAUDE.md): capture is synchronous and acknowledged,
// and any failure pages someone. A lead we drop is a customer who thinks they asked to be called
// and never hears back, so the only acceptable outcomes are "stored" or "in the dead-letter queue".

export const leadSchema = z.object({
  brand_id: z.guid(),
  market_code: z.string().regex(/^[A-Z]{2}$/, "market_code must be a two-letter ISO country code"),
  full_name: z.string().trim().min(1, "full_name is required").max(200),
  phone: z
    .string()
    .trim()
    .regex(
      /^\+[1-9][0-9]{6,14}$/,
      "phone must be in international format, e.g. +20 followed by the national number",
    ),
  city: z.string().trim().max(120).nullish(),
  model_id: z.guid().nullish(),
  trim_id: z.guid().nullish(),
  preferred_time: z.string().trim().max(120).nullish(),
  type: z.enum(["test_drive", "quote", "contact", "whatsapp"]).default("contact"),
  session_id: z.guid().nullish(),
  // Minted by the form once per submission and resent unchanged on every retry. It is the
  // idempotency key: capture_lead turns a repeat into a no-op instead of a second lead.
  submission_id: z.guid(),
  // Consent is not optional and never defaulted. A lead without it cannot be acted on legally,
  // so it must not be storable — the database says the same thing independently.
  consent_text_version: z.string().trim().min(1, "consent_text_version is required"),
  consent_at: z.iso.datetime({ offset: true }),
});

export type LeadPayload = z.infer<typeof leadSchema>;

/**
 * What a page may send. The brand and market are resolved by the database from the publishable
 * key, origin and market header (owner decision), so the body doesn't carry them. If it does,
 * they're ignored.
 */
export const publicLeadSchema = leadSchema.omit({ brand_id: true, market_code: true });
export type PublicLeadPayload = z.infer<typeof publicLeadSchema>;

export type LeadDecision<T = LeadPayload> =
  | { outcome: "accept"; lead: T }
  | { outcome: "reject"; error_message: string; consent_missing: boolean };

/** Field names and messages only — a lead payload is PII from end to end. */
export function describeFailure(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .slice(0, 5)
    .join("; ");
}

export function isConsentIssue(error: z.ZodError): boolean {
  return error.issues.some((issue) => String(issue.path[0] ?? "").startsWith("consent"));
}

/**
 * Validate one submission. A rejection is reported separately from a storage failure: a malformed
 * submission is the sender's problem and should be fixed at the form, while a lead we failed to
 * store is ours and belongs in the dead-letter queue.
 *
 * This is the internal schema, brand included: what the job worker replays from lead_dlq. A page's
 * submission goes through decidePublicLead instead.
 */
export function decideLead(raw: unknown): LeadDecision {
  return decideWith(leadSchema, raw);
}

/** The same rules for a submission from a page, which names no brand. */
export function decidePublicLead(raw: unknown): LeadDecision<PublicLeadPayload> {
  return decideWith(publicLeadSchema, raw);
}

function decideWith<T>(schema: z.ZodType<T>, raw: unknown): LeadDecision<T> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) {
    return { outcome: "accept", lead: parsed.data };
  }
  return {
    outcome: "reject",
    error_message: describeFailure(parsed.error),
    consent_missing: isConsentIssue(parsed.error),
  };
}

/**
 * What to log when a submission is rejected. Consent rejections are called out because they are the
 * ones that matter legally — "we dropped it because consent was absent" must be answerable later —
 * and because a spike of them means the form is broken, not that people are refusing.
 */
export function rejectionLog(
  decision: Extract<LeadDecision<unknown>, { outcome: "reject" }>,
  traceId: string,
) {
  return {
    level: "warn" as const,
    event: decision.consent_missing ? "lead_rejected_no_consent" : "lead_rejected_invalid",
    trace_id: traceId,
    reason: decision.error_message,
  };
}
