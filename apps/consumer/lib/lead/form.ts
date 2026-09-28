import type { LeadSubmission, LeadType, PreferredTime } from "./capture";
import type { LEAD_COPY } from "./copy";
import { normalizePhone } from "./phone";

// The lead form's values → a submission (slice 7). Pure: validation, the model/trim of interest,
// and when a new submission_id is due.

export interface LeadFormValues {
  fullName: string;
  phone: string;
  city: string | undefined;
  /** An interest option value (interestOption), or undefined for "not decided yet". */
  interest: string | undefined;
  preferredTime: PreferredTime;
  consent: boolean;
  /** When the consent box was ticked (ISO), or null. */
  consentAt: string | null;
}

export type LeadField = "fullName" | "phone" | "city" | "consent";
export type LeadErrors = Partial<Record<LeadField, string>>;

/** The select's value for a model or a trim of interest. */
export const interestOption = (kind: "model" | "trim", id: string) => `${kind}:${id}`;

/** The model and trim a select value names, checked against the page's own ids. */
export function parseInterest(
  value: string | undefined,
  trimModel: ReadonlyMap<string, string>,
  modelIds: ReadonlySet<string>,
): { model_id: string | null; trim_id: string | null } {
  const [kind, id] = value?.split(":") ?? [];
  if (kind === "trim" && id && trimModel.has(id)) {
    return { model_id: trimModel.get(id)!, trim_id: id };
  }
  if (kind === "model" && id && modelIds.has(id)) return { model_id: id, trim_id: null };
  return { model_id: null, trim_id: null };
}

export type BuildResult =
  | { ok: true; submission: Omit<LeadSubmission, "submission_id"> }
  | { ok: false; errors: LeadErrors };

export function buildSubmission(
  values: LeadFormValues,
  ctx: {
    type: LeadType;
    marketCode: string;
    consentVersion: string;
    cityRequired: boolean;
    trimModel: ReadonlyMap<string, string>;
    modelIds: ReadonlySet<string>;
  },
  copy: (typeof LEAD_COPY)["en"],
): BuildResult {
  const errors: LeadErrors = {};
  const fullName = values.fullName.trim().replace(/\s+/g, " ");
  if (fullName.length === 0 || fullName.length > 200) errors.fullName = copy.errors.name;
  const phone = normalizePhone(values.phone, ctx.marketCode);
  if (!phone.ok)
    errors.phone = ctx.marketCode === "EG" ? copy.errors.phone.EG : copy.errors.phone.other;
  if (ctx.cityRequired && !values.city) errors.city = copy.errors.city;
  if (!values.consent || !values.consentAt) errors.consent = copy.errors.consent;
  if (Object.keys(errors).length > 0 || !phone.ok) return { ok: false, errors };

  const { model_id, trim_id } = parseInterest(values.interest, ctx.trimModel, ctx.modelIds);
  return {
    ok: true,
    submission: {
      full_name: fullName,
      phone: phone.e164,
      city: values.city ?? null,
      model_id,
      trim_id,
      preferred_time: values.preferredTime,
      type: ctx.type,
      consent_text_version: ctx.consentVersion,
      consent_at: values.consentAt!,
    },
  };
}

/**
 * What makes two submits "the same request": everything the visitor chose. A retry of the same
 * request keeps its submission_id (so capture stays idempotent); any change mints a new one.
 */
export function requestFingerprint(s: Omit<LeadSubmission, "submission_id">): string {
  return JSON.stringify([
    s.full_name,
    s.phone,
    s.city,
    s.model_id,
    s.trim_id,
    s.preferred_time,
    s.type,
    s.consent_text_version,
    s.consent_at,
  ]);
}
