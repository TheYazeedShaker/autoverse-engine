import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  DeliveryError,
  RESEND_ENDPOINT,
  type RoutingConfig,
  deliverLeadWebhook,
  sendLeadEmail,
  signWebhook,
} from "./routing";
import type { LeadRouting } from "./store";

const lead: LeadRouting["lead"] = {
  id: "11111111-1111-1111-1111-111111111111",
  brand_id: "22222222-2222-2222-2222-222222222222",
  market_code: "EG",
  full_name: "Fatma Hassan",
  phone: "+201000000001",
  type: "test_drive",
  consent_text_version: "eg-v1",
  consent_at: "2026-09-24T10:00:00Z",
};

interface Sent {
  url: string;
  headers: Record<string, string>;
  body: string;
}

function config(respond: (sent: Sent) => Response | Promise<Response> = () => new Response("{}")) {
  const sent: Sent[] = [];
  const cfg: RoutingConfig = {
    resendApiKey: "re_test",
    leadEmailFrom: "Leads <leads@example.com>",
    now: () => 1_790_000_000_000,
    timeoutMs: 50,
    fetch: (async (url: string, init: RequestInit) => {
      const entry = {
        url,
        headers: Object.fromEntries(new Headers(init.headers).entries()),
        body: String(init.body),
      };
      sent.push(entry);
      return respond(entry);
    }) as unknown as typeof fetch,
  };
  return { cfg, sent };
}

const routing = (over: Partial<LeadRouting> = {}): LeadRouting => ({
  lead,
  emails: ["sales@example.com"],
  webhook_url: "https://hooks.example.com/leads",
  webhook_secret: "whsec_test",
  ...over,
});

describe("signWebhook (ADR 0012)", () => {
  it("is v1= + hex HMAC-SHA256 over '<timestamp>.<body>', matching a standard implementation", async () => {
    const expected = createHmac("sha256", "whsec_test").update('1790000000.{"a":1}').digest("hex");
    expect(await signWebhook("whsec_test", 1_790_000_000, '{"a":1}')).toBe(`v1=${expected}`);
  });
});

describe("deliverLeadWebhook", () => {
  it("posts the lead with timestamp, signature and delivery id headers that a receiver can verify", async () => {
    const { cfg, sent } = config();
    expect(await deliverLeadWebhook(routing(), "job-9", cfg)).toBe(true);

    const [req] = sent;
    expect(req?.url).toBe("https://hooks.example.com/leads");
    expect(req?.headers["x-autoverse-timestamp"]).toBe("1790000000");
    expect(req?.headers["x-autoverse-delivery"]).toBe("job-9");
    const recomputed = createHmac("sha256", "whsec_test")
      .update(`${req?.headers["x-autoverse-timestamp"]}.${req?.body}`)
      .digest("hex");
    expect(req?.headers["x-autoverse-signature"]).toBe(`v1=${recomputed}`);
    expect(JSON.parse(req?.body ?? "{}")).toMatchObject({
      event: "lead.captured",
      delivery_id: "job-9",
    });
  });

  it("is a no-op when the brand-market has no webhook", async () => {
    const { cfg, sent } = config();
    expect(await deliverLeadWebhook(routing({ webhook_url: null }), "job-9", cfg)).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("refuses to send unsigned PII when the URL has no secret", async () => {
    const { cfg, sent } = config();
    await expect(
      deliverLeadWebhook(routing({ webhook_secret: null }), "job-9", cfg),
    ).rejects.toThrow("not configured");
    expect(sent).toHaveLength(0);
  });

  it("fails on a non-2xx with the status only, never the response body", async () => {
    const { cfg } = config(() => new Response("secret internals + Fatma Hassan", { status: 500 }));
    const error = await deliverLeadWebhook(routing(), "job-9", cfg).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DeliveryError);
    expect((error as Error).message).toBe("webhook answered 500");
  });

  it("fails (for a retry) when the endpoint never answers within the timeout", async () => {
    const { cfg } = config();
    cfg.fetch = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) =>
        init.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
      )) as unknown as typeof fetch;
    await expect(deliverLeadWebhook(routing(), "job-9", cfg)).rejects.toThrow(
      "webhook unreachable",
    );
  });
});

describe("sendLeadEmail", () => {
  it("sends through Resend with an idempotency key tied to the job, so a retry can't double-send", async () => {
    const { cfg, sent } = config();
    expect(await sendLeadEmail(routing(), "job-7", cfg)).toBe(true);

    const [req] = sent;
    expect(req?.url).toBe(RESEND_ENDPOINT);
    expect(req?.headers["authorization"]).toBe("Bearer re_test");
    expect(req?.headers["idempotency-key"]).toBe("lead-email/job-7");
    const body = JSON.parse(req?.body ?? "{}");
    expect(body.to).toEqual(["sales@example.com"]);
    expect(body.subject).toBe("New lead · Test drive · EG");
    expect(body.text).toContain("+201000000001");
  });

  it("is a no-op when the brand-market has no recipients", async () => {
    const { cfg, sent } = config();
    expect(await sendLeadEmail(routing({ emails: [] }), "job-7", cfg)).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("fails loudly without a Resend key rather than dropping the notification", async () => {
    const { cfg } = config();
    delete cfg.resendApiKey;
    await expect(sendLeadEmail(routing(), "job-7", cfg)).rejects.toThrow("not configured");
  });
});
