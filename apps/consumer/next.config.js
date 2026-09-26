import { withSentryConfig } from "@sentry/nextjs";

// Showroom images (ADR 0020): next/image may fetch from exactly one remote base, the public
// published bucket in ASSET_BASE_URL (read at BUILD time; declared in apps/consumer/turbo.json).
// Unset, no remote image is allowed and the page shows its placeholders.
function assetRemotePatterns() {
  const raw = process.env.ASSET_BASE_URL;
  if (!raw) return [];
  const base = new URL(raw.endsWith("/") ? raw : `${raw}/`);
  // The pattern must be exactly one bucket's public prefix. A bare host ("/**") would turn the image
  // optimiser into a proxy for everything on it (other buckets, render endpoints, APIs). Fail the
  // build rather than ship that. Same rules as assetBase() in lib/showroom/images.ts.
  if (base.protocol !== "https:" || base.search || base.hash || base.pathname === "/") {
    throw new Error(
      "ASSET_BASE_URL must be an https URL of one bucket's public prefix (no query, not the host root)",
    );
  }
  return [
    {
      protocol: base.protocol.replace(":", ""),
      hostname: base.hostname,
      port: base.port,
      pathname: `${base.pathname}**`,
    },
  ];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: assetRemotePatterns(),
    // Card and hero widths (spec §5.3 srcset: 960/1440/1920), plus the smaller card widths.
    deviceSizes: [640, 960, 1440, 1920],
    imageSizes: [320, 480],
    formats: ["image/avif", "image/webp"],
    // One day. Keys aren't content-hashed yet (the 1·B publish step will make them so; ADR 0018), and
    // the optimiser's copy is one more cache a take-down has to clear (ADR 0020). Raise it once keys
    // are immutable.
    minimumCacheTTL: 60 * 60 * 24,
  },
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
