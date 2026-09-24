import { describe, expect, it } from "vitest";
import { authorize, bearerToken, constantTimeEqual } from "../shared/auth";
import { requireEnv } from "../shared/log";

const JWT = "aaa.bbb.ccc";
const deps = (overrides: Partial<Parameters<typeof authorize>[1]> = {}) => ({
  cronSecret: "s3cret-value",
  isTenancyManager: async (jwt: string) => jwt === JWT,
  ...overrides,
});

describe("authorize", () => {
  it("lets the cron call in with the shared secret", async () => {
    expect(await authorize("Bearer s3cret-value", deps())).toBe("cron");
  });

  it("lets a superadmin/ops user in with their JWT (manual run now)", async () => {
    expect(await authorize(`Bearer ${JWT}`, deps())).toBe("staff");
  });

  it("refuses a wrong secret, a non-manager JWT, and no credentials at all", async () => {
    expect(await authorize("Bearer wrong", deps())).toBeNull();
    expect(await authorize("Bearer x.y.z", deps())).toBeNull();
    expect(await authorize(null, deps())).toBeNull();
    expect(await authorize("Basic s3cret-value", deps())).toBeNull();
  });

  it("fails closed when the secret isn't configured, even for an empty bearer", async () => {
    expect(await authorize("Bearer ", deps({ cronSecret: undefined }))).toBeNull();
    expect(await authorize("Bearer undefined", deps({ cronSecret: undefined }))).toBeNull();
  });

  it("never asks the auth server about something that isn't a JWT", async () => {
    let asked = false;
    await authorize("Bearer not-a-jwt", deps({ isTenancyManager: async () => (asked = true) }));
    expect(asked).toBe(false);
  });
});

describe("constantTimeEqual", () => {
  it("compares by value, whatever the lengths", async () => {
    expect(await constantTimeEqual("abc", "abc")).toBe(true);
    expect(await constantTimeEqual("abc", "abd")).toBe(false);
    expect(await constantTimeEqual("abc", "abcd")).toBe(false);
  });
});

describe("bearerToken", () => {
  it("reads a Bearer token and nothing else", () => {
    expect(bearerToken("Bearer abc.def")).toBe("abc.def");
    expect(bearerToken("Bearer ")).toBeNull();
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});

describe("requireEnv", () => {
  it("names every missing variable (never a value) so a bad deploy is obvious", () => {
    const env: Record<string, string> = { A: "1" };
    expect(requireEnv((n) => env[n], ["A", "B", "C"])).toEqual({ ok: false, missing: ["B", "C"] });
    expect(requireEnv((n) => env[n], ["A"])).toEqual({ ok: true, values: { A: "1" } });
  });
});
