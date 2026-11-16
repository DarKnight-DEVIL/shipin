import type { NextConfig } from 'next';
import withBundleAnalyzer from '@next/bundle-analyzer';

const ANALYZE = process.env.ANALYZE === 'true';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  // Workspace packages ship TypeScript sources rather than a build output, so
  // Next has to compile them as part of the app graph.
  // firebase-admin/jose/jwks-rsa are NOT transpiled — they are server-only.
  // Each file that imports them must have `import 'server-only'` at the top.
  transpilePackages: ['@shipin/config', '@shipin/shared', '@shipin/ui', '@shipin/utils'],
  experimental: {
    // Tree-shake barrel imports from these packages instead of bundling
    // their whole entry graph into every page that touches them.
    optimizePackageImports: ['lucide-react', 'date-fns', 'recharts', 'framer-motion'],
  },
  async headers() {
    // Production only. Next warns that a custom /_next/static Cache-Control can
    // break its development behavior — Fast Refresh re-fetches chunks and a
    // year-long `immutable` makes the browser refuse — and the pin exists for
    // the deployed build, where every filename is content-hashed anyway.
    if (process.env.NODE_ENV !== 'production') return [];

    return [
      {
        // Build output under /_next/static carries a content hash in every
        // filename, so a year of immutable caching cannot serve a stale chunk:
        // a new build produces new names. Setting it here makes that decision
        // explicit and testable instead of inheriting whatever the host or the
        // framework default happens to be that week.
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer({ enabled: ANALYZE })(nextConfig);