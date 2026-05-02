import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  onDemandEntries: {
    maxInactiveAge: 0,
  },
};

export default nextConfig;
