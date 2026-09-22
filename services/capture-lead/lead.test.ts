import { describe, expect, it } from "vitest";
import { decideLead, rejectionLog } from "./lead";

const valid = {
  brand_id: "11111111-1111-1111-1111-111111111111",
  market_code: "EG",
  full_name: "Fatma Hassan",
  phone: "+201000000001",
  consent_text_version: "eg-v1",
  consent_at: "2026-09-22T10:00:00.000Z",
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
