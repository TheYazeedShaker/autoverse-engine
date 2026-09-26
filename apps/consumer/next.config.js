import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@autoverse/ui",
    "@autoverse/tokens",
    "@autoverse/types",
    "@autoverse/engine-core",
  ],
  // Build time, baked in at build and shown on /api/health behind the health_build_info flag.
  env: {
    BUILD_TIME: new Date().toISOString(),
  },
};

// Sentry's Next plugin wires the SDK into the build. Source-map upload stays off until a
// SENTRY_AUTH_TOKEN exists (it would be a CI/Vercel secret, never committed). When it does, add
// SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT to passThroughEnv in apps/consumer/turbo.json:
// the plugin reads them implicitly, so turbo-env.test.ts can't see those reads.
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  sourcemaps: { disable: true },
});
