/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@autoverse/ui", "@autoverse/tokens", "@autoverse/types"],
  // Build time, baked in at build and shown on /api/health behind the health_build_info flag.
  env: {
    BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;
