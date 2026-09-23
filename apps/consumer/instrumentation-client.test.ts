import { afterEach, describe, expect, it, vi } from "vitest";

// Guards a privacy decision: until the consent flow exists (Phase 1·C), PostHog may be wired but
// must capture nothing implicitly and store nothing on the device.
const init = vi.hoisted(() => vi.fn());
vi.mock("posthog-js", () => ({ default: { init } }));
vi.mock("@sentry/nextjs", () => ({ init: vi.fn(), captureRouterTransitionStart: vi.fn() }));

afterEach(() => {
  init.mockReset();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("client instrumentation — PostHog", () => {
  it("does not initialise PostHog at all without a key", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    await import("./instrumentation-client");
    expect(init).not.toHaveBeenCalled();
  });

  it("initialises with no autocapture, no pageviews, no recording and no device storage", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_public_key");
    await import("./instrumentation-client");
    expect(init).toHaveBeenCalledTimes(1);
    expect(init.mock.calls[0]![1]).toMatchObject({
      persistence: "memory",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
    });
  });
});
