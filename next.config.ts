import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable Strict Mode to prevent WebGPU texture destruction on mount
  reactStrictMode: process.env.NODE_ENV !== "production",

  // Production security: disable source maps in production
  productionBrowserSourceMaps: false,

  // Disable powered-by header
  poweredByHeader: false,

  // Keep heavy Node-only SDKs external so Turbopack doesn’t bundle them

  // Prefer server-rendering dashboard/admin pages and static for public site
  // (route exports are set per-page where needed)
  output: "standalone"
};

export default nextConfig;
