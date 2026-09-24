import { describe, expect, it } from "vitest";
import { clientAddress, clientId, readPublicCaller, refusalStatus } from "../shared/public-caller";
import { TURNSTILE_VERIFY_URL, verifyTurnstile } from "../shared/turnstile";

const KEY = "pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

describe("readPublicCaller", () => {
  it("reads key, origin and market from the headers, never the body", () => {
    const headers = new Headers({
      "x-autoverse-key": KEY,
      origin: "https://a.example.com",
      "x-autoverse-market": "eg",
    });
    expect(readPublicCaller(headers)).toEqual({
      key: KEY,
      origin: "https://a.example.com",
      market: "EG",
    });
  });

  it("refuses a request missing any of them, or with a malformed key", () => {
    expect(
      readPublicCaller(
        new Headers({ origin: "https://a.example.com", "x-autoverse-market": "EG" }),
      ),
    ).toBeNull();
    expect(
      readPublicCaller(new Headers({ "x-autoverse-key": KEY, "x-autoverse-market": "EG" })),
    ).toBeNull();
    expect(
      readPublicCaller(new Headers({ "x-autoverse-key": KEY, origin: "https://a.example.com" })),
    ).toBeNull();
    expect(
      readPublicCaller(
        new Headers({
          "x-autoverse-key": "sk_live_x",
          origin: "https://a",
          "x-autoverse-market": "EG",
        }),
      ),
    ).toBeNull();
  });
});

describe("clientId", () => {
  it("is a keyed hash: stable per address, different per secret, and never the address itself", async () => {
    const a = await clientId("203.0.113.7", "secret-1");
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(await clientId("203.0.113.7", "secret-1")).toBe(a);
    expect(await clientId("203.0.113.7", "secret-2")).not.toBe(a);
    expect(await clientId("203.0.113.8", "secret-1")).not.toBe(a);
    expect(a).not.toContain("203");
  });

  it("refuses to run without its secret rather than falling back to a plain hash", async () => {
    await expect(clientId("203.0.113.7", "")).rejects.toThrow("CLIENT_HASH_SECRET");
  });

  it("takes the first x-forwarded-for entry as the visitor", () => {
    expect(clientAddress(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe(
      "203.0.113.7",
    );
    expect(clientAddress(new Headers())).toBe("unknown");
  });
});

describe("refusalStatus", () => {
  it("maps the gate's refusals to generic HTTP answers", () => {
    expect(refusalStatus("42501")).toEqual({ status: 403, error: "Not authorized." });
    expect(refusalStatus("AV429")?.status).toBe(429);
    expect(refusalStatus("22023")?.status).toBe(400);
    expect(refusalStatus("23514")).toBeNull();
  });
});

describe("verifyTurnstile", () => {
  const answering = (status: number, body: unknown) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("passes only on a clear success from Cloudflare", async () => {
    let sentTo = "";
    const fetchSpy = (async (url: string) => {
      sentTo = url;
      return new Response(JSON.stringify({ success: true }));
    }) as unknown as typeof fetch;
    expect(
      await verifyTurnstile("tok", "203.0.113.7", { secret: "s", fetch: fetchSpy, timeoutMs: 50 }),
    ).toBe(true);
    expect(sentTo).toBe(TURNSTILE_VERIFY_URL);
  });

  it("fails closed: no token, no secret, a failure, an error status, or no answer", async () => {
    const ok = answering(200, { success: true });
    expect(await verifyTurnstile(null, "", { secret: "s", fetch: ok, timeoutMs: 50 })).toBe(false);
    expect(await verifyTurnstile("tok", "", { secret: undefined, fetch: ok, timeoutMs: 50 })).toBe(
      false,
    );
    expect(
      await verifyTurnstile("tok", "", {
        secret: "s",
        fetch: answering(200, { success: false }),
        timeoutMs: 50,
      }),
    ).toBe(false);
    expect(
      await verifyTurnstile("tok", "", { secret: "s", fetch: answering(500, {}), timeoutMs: 50 }),
    ).toBe(false);
    const hang = ((_u: string, init: RequestInit) =>
      new Promise((_r, reject) =>
        init.signal?.addEventListener("abort", () => reject(new Error("x"))),
      )) as unknown as typeof fetch;
    expect(await verifyTurnstile("tok", "", { secret: "s", fetch: hang, timeoutMs: 20 })).toBe(
      false,
    );
  });
});
