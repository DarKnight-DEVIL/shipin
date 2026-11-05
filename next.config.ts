import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable Strict Mode to prevent WebGPU texture destruction on mount
  reactStrictMode: process.env.NODE_ENV !== "production",

  // Production security: disable source maps in production
  productionBrowserSourceMaps: false,

  // Disable powered-by header
  poweredByHeader: false,

  // Keep heavy Node-only SDKs external to the server bundle so Turbopack
  // does not trace their internal Node builtins (fs, net, tls) at build time.
  serverExternalPackages: [
    "firebase-admin",
    "@google-cloud/firestore",
    "@grpc/grpc-js",
  ],

  // Security: disable client-side navigation for sensitive routes
  // (handled by middleware)

  // Experimental features (if needed)
  // experimental: {
  //   appDir: true,
  // },
};

export default nextConfig;