import { describe, expect, it } from "vitest";
import { decideLead, rejectionLog } from "./lead";

const valid = {
  brand_id: "11111111-1111-1111-1111-111111111111",
  market_code: "EG",
  full_name: "Fatma Hassan",
  phone: "+201000000001",
  consent_text_version: "eg-v1",
  consent_at: "2026-09-22T10:00:00.000Z",
  submission_id: "33333333-3333-3333-3333-333333333333",
};

describe("decideLead", () => {
  it("accepts a valid submission and defaults the type", () => {
    const decision = decideLead(valid);
    expect(decision.outcome).toBe("accept");
    if (decision.outcome === "accept") expect(decision.lead.type).toBe("contact");
  });

  it("refuses a submission with no consent, and says so distinctly", () => {
    for (const missing of ["consent_text_version", "consent_at"]) {
      const body: Record<string, unknown> = { ...valid };
      delete body[missing];
      const decision = decideLead(body);
      expect(decision.outcome).toBe("reject");
      if (decision.outcome === "reject") {
        expect(decision.consent_missing).toBe(true);
        expect(rejectionLog(decision, "trace-1").event).toBe("lead_rejected_no_consent");
      }
    }
  });

  it("refuses a blank consent version — present but empty is still no consent", () => {
    const decision = decideLead({ ...valid, consent_text_version: "   " });
    expect(decision.outcome).toBe("reject");
    if (decision.outcome === "reject") expect(decision.consent_missing).toBe(true);
  });

  it("separates an invalid submission from a missing-consent one", () => {
    const decision = decideLead({ ...valid, phone: "01000000000" });
    expect(decision.outcome).toBe("reject");
    if (decision.outcome === "reject") {
      expect(decision.consent_missing).toBe(false);
      expect(rejectionLog(decision, "trace-1").event).toBe("lead_rejected_invalid");
    }
  });

  it("requires a name and an international phone number", () => {
    expect(decideLead({ ...valid, full_name: "  " }).outcome).toBe("reject");
    expect(decideLead({ ...valid, phone: "+1" }).outcome).toBe("reject");
  });

  it("never puts the person's details in the rejection message", () => {
    const decision = decideLead({ ...valid, phone: "01000000000" });
    if (decision.outcome !== "reject") throw new Error("expected a rejection");
    expect(decision.error_message).toContain("phone");
    expect(decision.error_message).not.toContain("Fatma");
    expect(decision.error_message).not.toContain("01000000000");
    expect(rejectionLog(decision, "trace-1").reason).not.toContain("Fatma");
  });
});

describe("submission_id", () => {
  it("is required, because it is what makes a retried capture a no-op", () => {
    const withoutKey: Record<string, unknown> = { ...valid };
    delete withoutKey.submission_id;
    const decision = decideLead(withoutKey);
    expect(decision.outcome).toBe("reject");
    if (decision.outcome === "reject") expect(decision.error_message).toContain("submission_id");
  });

  it("is carried through unchanged so a dead-letter replay reuses it", () => {
    const decision = decideLead(valid);
    if (decision.outcome !== "accept") throw new Error("expected accept");
    expect(decision.lead.submission_id).toBe(valid.submission_id);
  });
});
