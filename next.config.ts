import type { NextConfig } from "next";

// Set DEPLOY_TARGET=vercel to build for Vercel (no standalone output)
const isVercel = process.env.DEPLOY_TARGET === "vercel"

const nextConfig: NextConfig = {
  ...(isVercel ? {} : { output: "standalone" }),
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  onDemandEntries: {
    maxInactiveAge: 0,
  },
};

export default nextConfig;
