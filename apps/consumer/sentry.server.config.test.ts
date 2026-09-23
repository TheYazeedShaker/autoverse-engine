import { describe, expect, it } from "vitest";

// Smoke test: with no DSN, the server Sentry config must load AND self-disable (no-op),
// so local/CI boots never emit to Sentry. Asserts observable state, not just "doesn't throw".
describe("sentry.server.config", () => {
  // Importing the full @sentry/nextjs SDK cold can take >5s on a slow machine; this is load time,
  // not flakiness, so the test gets a generous budget.
  it("self-disables when no DSN is configured", { timeout: 30_000 }, async () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    delete process.env.SENTRY_DSN;

    const Sentry = await import("@sentry/nextjs");
    await import("./sentry.server.config");

    // Either no active client, or a client explicitly disabled — both mean the SDK is a no-op.
    expect(Sentry.getClient()?.getOptions().enabled ?? false).toBe(false);
  });
});
