import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

// Client-side observability (browser). Next.js runs this on the client automatically.
// Both keys are public-safe and come from env; each SDK is a no-op when its key is absent.

// ---- Sentry: errors + a light trace sample. No PII (CLAUDE.md, "Delivery & quality"). ----
const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
Sentry.init({
  dsn: sentryDsn,
  enabled: Boolean(sentryDsn),
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
});

// ---- PostHog: wired, but capturing nothing automatically. ----
// Consent defaults are per brand-market (CLAUDE.md, "Data & tenancy") and no consent flow exists
// yet, so nothing is stored on the device and nothing is captured implicitly: no cookies/storage,
// no autocapture, no automatic pageviews, no session recording. Explicit, consent-aware capture
// arrives with the consumer journey spec (Phase 1·C).
const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
    persistence: "memory",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
