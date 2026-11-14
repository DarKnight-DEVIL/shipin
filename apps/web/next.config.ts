import type { NextConfig } from 'next';
import withBundleAnalyzer from '@next/bundle-analyzer';

const ANALYZE = process.env.ANALYZE === 'true';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  // Workspace packages ship TypeScript sources rather than a build output, so
  // Next has to compile them as part of the app graph.
  transpilePackages: ['@shipin/config', '@shipin/shared', '@shipin/ui', '@shipin/utils'],
  experimental: {
    // Tree-shake barrel imports from these packages instead of bundling
    // their whole entry graph into every page that touches them.
    optimizePackageImports: ['lucide-react', 'date-fns', 'recharts', 'framer-motion'],
  },
};

export default withBundleAnalyzer({ enabled: ANALYZE })(nextConfig);
