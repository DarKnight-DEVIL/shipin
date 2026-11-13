import type { NextConfig } from 'next';

const sentryWebpackPluginOptions = {
  // Silent mode
  silent: true,
  // Automatically upload source maps during build
  widenClientFileUpload: true,
  // Hides source maps from generated client bundles
  hideSourceMaps: true,
  // Automatically tree-shake Sentry logger statements
  disableLogger: true,
  // Automatically instrument Vercel serverless functions
  automaticVercelMonitors: true,
};

export function initSentryConfig(config: NextConfig): NextConfig {
  // Only apply Sentry in production
  if (process.env.NEXT_PUBLIC_SENTRY_DSN && process.env.NODE_ENV === 'production') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { withSentryConfig } = require('@sentry/nextjs');
      return withSentryConfig(config, sentryWebpackPluginOptions);
    } catch (e) {
      console.warn('Sentry not available, skipping:', e);
    }
  }
  return config;
}