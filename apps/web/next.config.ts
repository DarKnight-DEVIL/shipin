import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

import { initSentryConfig } from "./sentry.config";
import { STANDALONE_OUTPUT_EXCLUDES } from "./standalone-output-excludes.mjs";

const ANALYZE = process.env.ANALYZE === "true";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Vercel builds Next.js itself and runs one function per route, so it must
  // not get standalone output. Standalone is for the targets that run a single
  // traced Node server — the Docker image and `npm start` — and emitting it for
  // Vercel too made the deployment one generic `index` function executing the
  // traced tree, which crashed on a runtime `require()` of jose's ESM entry
  // (jwks-rsa, pulled in by firebase-admin). Vercel sets VERCEL=1 in its build
  // environment; see scripts/prepare-standalone.mjs, which skips itself there.
  output: process.env.VERCEL ? undefined : "standalone",
  // The tracer follows filesystem reads in server code, so local run artefacts
  // end up in the standalone tree (coverage/ alone is 13 MB) and from there in
  // anything built out of it. Keys are route globs and '*' matches every route.
  // The separate `instrumentation` trace — the one that walks src/app/api — is
  // not part of that per-route pass, so scripts/prepare-standalone.mjs prunes
  // the same STANDALONE_ARTEFACTS list from the tree it serves.
  outputFileTracingExcludes: {
    "*": [...STANDALONE_OUTPUT_EXCLUDES],
  },
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  // Workspace packages ship TypeScript sources rather than a build output, so
  // Next has to compile them as part of the app graph.
  // firebase-admin/jose/jwks-rsa are NOT transpiled — they are server-only.
  // Each file that imports them must have `import 'server-only'` at the top.
  transpilePackages: [
    "@shipin/config",
    "@shipin/shared",
    "@shipin/ui",
    "@shipin/utils",
  ],
  images: {
    // Firebase Auth fills `photoURL` with the Google account picture, which is
    // served from lh3. Without this entry next/image refuses the src at render
    // time ("hostname is not configured") and every admin customer avatar is a
    // broken image. The R2 photos are deliberately NOT listed: they are
    // presigned, per-request URLs on <account>.r2.cloudflarestorage.com, so they
    // cannot be cached by the optimizer at all (see the `unoptimized` props at
    // the R2 call sites).
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
    ],
  },
  experimental: {
    // Tree-shake barrel imports from these packages instead of bundling
    // their whole entry graph into every page that touches them.
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "recharts",
      "framer-motion",
    ],
  },
  async headers() {
    // Production only. Next warns that a custom /_next/static Cache-Control can
    // break its development behavior — Fast Refresh re-fetches chunks and a
    // year-long `immutable` makes the browser refuse — and the pin exists for
    // the deployed build, where every filename is content-hashed anyway.
    if (process.env.NODE_ENV !== "production") return [];

    return [
      {
        // Build output under /_next/static carries a content hash in every
        // filename, so a year of immutable caching cannot serve a stale chunk:
        // a new build produces new names. Setting it here makes that decision
        // explicit and testable instead of inheriting whatever the host or the
        // framework default happens to be that week.
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

// Sentry first: withSentryConfig wraps the finished config so the analyzer's
// output is uploaded too. It is a no-op unless a DSN and an auth token exist.
export default initSentryConfig(
  withBundleAnalyzer({ enabled: ANALYZE })(nextConfig)
);
