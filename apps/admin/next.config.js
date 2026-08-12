/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@autoverse/ui", "@autoverse/tokens", "@autoverse/types"],
};

export default nextConfig;
