import * as Sentry from "@sentry/nextjs";

// Server-side Sentry init (Node runtime). Loaded from instrumentation.ts.
// DSN comes from env; the SDK is a no-op when it's absent (local/CI).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  // No PII in error reports — leads/PII never reach Sentry (CLAUDE.md §6).
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
});
