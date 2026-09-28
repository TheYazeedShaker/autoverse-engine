import { describe, expect, it } from "vitest";
import { LEAD_COPY } from "./copy";
import {
  buildSubmission,
  interestOption,
  parseInterest,
  requestFingerprint,
  type LeadFormValues,
} from "./form";

const M = "00000000-0000-4000-8000-0000000000a1";
const T = "00000000-0000-4000-8000-0000000000b1";
const trimModel = new Map([[T, M]]);
const modelIds = new Set([M]);
const CTX = {
  type: "test_drive" as const,
  marketCode: "EG",
  consentVersion: "eg-v1",
  cityRequired: true,
  trimModel,
  modelIds,
};

const VALID: LeadFormValues = {
  fullName: "  Mona   Adel ",
  phone: "010 1234 5678",
  city: "cairo",
  interest: interestOption("trim", T),
  preferredTime: "today",
  consent: true,
  consentAt: "2026-09-28T12:00:00.000Z",
};

describe("buildSubmission", () => {
  it("builds the contract's fields: tidy name, +20 phone, city id, model and trim", () => {
    const r = buildSubmission(VALID, CTX, LEAD_COPY.en);
    expect(r).toEqual({
      ok: true,
      submission: {
        full_name: "Mona Adel",
        phone: "+201012345678",
        city: "cairo",
        model_id: M,
        trim_id: T,
        preferred_time: "today",
        type: "test_drive",
        consent_text_version: "eg-v1",
        consent_at: "2026-09-28T12:00:00.000Z",
      },
    });
  });

  it("reports every problem at once, in the page's language", () => {
    const r = buildSubmission(
      { ...VALID, fullName: " ", phone: "123", city: undefined, consent: false, consentAt: null },
      CTX,
      LEAD_COPY.ar,
    );
    expect(r).toEqual({
      ok: false,
      errors: {
        fullName: LEAD_COPY.ar.errors.name,
        phone: LEAD_COPY.ar.errors.phone.EG,
        city: LEAD_COPY.ar.errors.city,
        consent: LEAD_COPY.ar.errors.consent,
      },
    });
  });

  it("consent is never assumed: unticked means no submission", () => {
    const r = buildSubmission({ ...VALID, consent: false }, CTX, LEAD_COPY.en);
    expect(r.ok).toBe(false);
  });

  it("no city list: the city is optional and sent as null", () => {
    const r = buildSubmission(
      { ...VALID, city: undefined },
      { ...CTX, cityRequired: false },
      LEAD_COPY.en,
    );
    expect(r.ok && r.submission.city).toBeNull();
  });
});

describe("parseInterest", () => {
  it("a trim names its model; a model alone has no trim", () => {
    expect(parseInterest(interestOption("trim", T), trimModel, modelIds)).toEqual({
      model_id: M,
      trim_id: T,
    });
    expect(parseInterest(interestOption("model", M), trimModel, modelIds)).toEqual({
      model_id: M,
      trim_id: null,
    });
  });

  it("an unknown or foreign id is dropped, never sent", () => {
    const foreign = "00000000-0000-4000-8000-00000000ffff";
    expect(parseInterest(interestOption("trim", foreign), trimModel, modelIds)).toEqual({
      model_id: null,
      trim_id: null,
    });
    expect(parseInterest("model:" + foreign, trimModel, modelIds).model_id).toBeNull();
    expect(parseInterest(undefined, trimModel, modelIds).model_id).toBeNull();
  });
});

describe("requestFingerprint", () => {
  it("is the same for the same request and changes with any choice", () => {
    const a = buildSubmission(VALID, CTX, LEAD_COPY.en);
    const b = buildSubmission({ ...VALID, preferredTime: "exploring" }, CTX, LEAD_COPY.en);
    if (!a.ok || !b.ok) throw new Error("fixture");
    expect(requestFingerprint(a.submission)).toBe(requestFingerprint({ ...a.submission }));
    expect(requestFingerprint(a.submission)).not.toBe(requestFingerprint(b.submission));
  });
});
