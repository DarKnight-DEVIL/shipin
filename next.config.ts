import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable Strict Mode to prevent WebGPU texture destruction on mount
  reactStrictMode: process.env.NODE_ENV !== "production",

  // Production security: disable source maps in production
  productionBrowserSourceMaps: false,

  // Disable powered-by header
  poweredByHeader: false,

  // Security: disable client-side navigation for sensitive routes
  // (handled by middleware)

  // Experimental features (if needed)
  // experimental: {
  //   appDir: true,
  // },
};

export default nextConfig;