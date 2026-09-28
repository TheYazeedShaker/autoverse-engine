import { z } from "zod";

// The page's side of the lead boundary (CLAUDE.md: every cross-boundary payload is Zod-validated on
// both sides). capture-lead validates the same body with its publicLeadSchema
// (services/capture-lead/lead.ts); schema.contract.test.ts pins this one to it. The page sends a
// subset of what the service accepts: no `whatsapp` type (not a form lead) and no session id yet
// (slice 9), and the preferred time is one of three keys, never free text.
//
// Strict: a field the service doesn't know can't slip into a lead.

export const LEAD_TYPES = ["test_drive", "quote", "contact"] as const;
export const PREFERRED_TIMES = ["today", "this_week", "exploring"] as const;

export const PageLeadSubmission = z.strictObject({
  full_name: z.string().trim().min(1).max(200),
  // International format, as the service requires.
  phone: z.string().regex(/^[+][1-9][0-9]{6,14}$/),
  // A lead_cities id, or null when the market lists none.
  city: z.string().max(120).nullable(),
  model_id: z.guid().nullable(),
  trim_id: z.guid().nullable(),
  preferred_time: z.enum(PREFERRED_TIMES),
  type: z.enum(LEAD_TYPES),
  submission_id: z.guid(),
  consent_text_version: z.string().trim().min(1),
  consent_at: z.iso.datetime({ offset: true }),
});

export type PageLeadSubmission = z.infer<typeof PageLeadSubmission>;
export type LeadType = PageLeadSubmission["type"];
export type PreferredTime = PageLeadSubmission["preferred_time"];
