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
  // Consent is not optional and never defaulted. A lead without it cannot be acted on legally,
  // so it must not be storable — the database says the same thing independently.
  consent_text_version: z.string().trim().min(1, "consent_text_version is required"),
  consent_at: z.iso.datetime({ offset: true }),
});

export type LeadPayload = z.infer<typeof leadSchema>;

export type LeadDecision =
  | { outcome: "accept"; lead: LeadPayload }
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
 */
export function decideLead(raw: unknown): LeadDecision {
  const parsed = leadSchema.safeParse(raw);
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
  decision: Extract<LeadDecision, { outcome: "reject" }>,
  traceId: string,
) {
  return {
    level: "warn" as const,
    event: decision.consent_missing ? "lead_rejected_no_consent" : "lead_rejected_invalid",
    trace_id: traceId,
    reason: decision.error_message,
  };
}
