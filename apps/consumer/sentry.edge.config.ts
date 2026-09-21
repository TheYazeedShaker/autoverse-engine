import * as Sentry from "@sentry/nextjs";

// Edge-runtime Sentry init (middleware / edge routes). Loaded from instrumentation.ts.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
});
