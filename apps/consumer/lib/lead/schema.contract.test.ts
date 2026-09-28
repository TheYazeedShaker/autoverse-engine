import { describe, expect, it } from "vitest";
// The other side of the boundary: the schema capture-lead validates a page's body with.
import { publicLeadSchema } from "../../../../services/capture-lead/lead";
import { LEAD_COPY } from "./copy";
import { buildSubmission, interestOption } from "./form";
import { LEAD_TYPES, PREFERRED_TIMES, PageLeadSubmission } from "./schema";

// A contract test between the page and capture-lead (CLAUDE.md: Zod on both sides). Whatever the
// page's schema accepts, the service's must accept too; otherwise every lead of that shape would be
// a 422 in production.

const M = "00000000-0000-4000-8000-0000000000a1";
const T = "00000000-0000-4000-8000-0000000000b1";

function pageBody(patch: Partial<PageLeadSubmission> = {}): PageLeadSubmission {
  const built = buildSubmission(
    {
      fullName: "Mona Adel",
      phone: "010 1234 5678",
      city: "cairo",
      interest: interestOption("trim", T),
      preferredTime: "today",
      consent: true,
      consentAt: new Date("2026-09-28T12:00:00Z").toISOString(),
    },
    {
      type: "test_drive",
      marketCode: "EG",
      consentVersion: "eg-v1",
      cityRequired: true,
      trimModel: new Map([[T, M]]),
      modelIds: new Set([M]),
    },
    LEAD_COPY.en,
  );
  if (!built.ok) throw new Error("fixture");
  return PageLeadSubmission.parse({
    ...built.submission,
    submission_id: "3f2b8c1e-9d4a-4e7b-8a61-0c5d2e9f1a7b",
    ...patch,
  });
}

describe("page ↔ capture-lead contract", () => {
  it("a body the page builds passes the service's schema", () => {
    expect(publicLeadSchema.safeParse(pageBody()).success).toBe(true);
  });

  it.each(LEAD_TYPES)("every lead type the page sends is one the service takes: %s", (type) => {
    expect(publicLeadSchema.safeParse(pageBody({ type })).success).toBe(true);
  });

  it.each(PREFERRED_TIMES)("every preferred time fits the service: %s", (preferred_time) => {
    expect(publicLeadSchema.safeParse(pageBody({ preferred_time })).success).toBe(true);
  });

  it("the page's nullable fields are nullable on the service too", () => {
    expect(
      publicLeadSchema.safeParse(pageBody({ city: null, model_id: null, trim_id: null })).success,
    ).toBe(true);
  });

  it("every field the page sends is one the service knows", () => {
    const serviceKeys = new Set(Object.keys(publicLeadSchema.shape));
    for (const key of Object.keys(PageLeadSubmission.shape)) expect(serviceKeys).toContain(key);
  });

  it("the page refuses what the service would refuse (a local phone, an extra field)", () => {
    expect(PageLeadSubmission.safeParse({ ...pageBody(), phone: "01012345678" }).success).toBe(
      false,
    );
    expect(PageLeadSubmission.safeParse({ ...pageBody(), brand_id: M }).success).toBe(false);
  });
});
