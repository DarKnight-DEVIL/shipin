/**
 * Build-time Sentry wiring.
 *
 * `@sentry/nextjs` needs `withSentryConfig` around the Next config for source-map
 * upload and release tagging. It is applied only when a DSN *and* an auth token
 * are present: without the token there is nothing to upload, and wrapping
 * anyway makes every local/CI build print upload warnings for a deployment
 * configuration it does not have.
 *
 * Runtime error capture does NOT depend on this file: `instrumentation.ts`
 * initialises the SDK from sentry.server.config.ts / sentry.edge.config.ts and
 * `instrumentation-client.ts` from sentry.client.config.ts. Those only need
 * NEXT_PUBLIC_SENTRY_DSN (server: SENTRY_DSN or NEXT_PUBLIC_SENTRY_DSN).
 */
import type { NextConfig } from "next";
// @sentry/nextjs v11 moved the build wrapper to its own entry point; the
// package root no longer exports it.
import { withSentryConfig, type SentryBuildOptions } from "@sentry/nextjs/config";

// v11 reads SENTRY_ORG / SENTRY_PROJECT / SENTRY_AUTH_TOKEN from the environment
// and dropped the old `disableLogger` / `hideSourceMaps` flags.
const SENTRY_BUILD_OPTIONS: SentryBuildOptions = {
  silent: true,
  widenClientFileUpload: true,
};

export function initSentryConfig(config: NextConfig): NextConfig {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  const authToken = process.env.SENTRY_AUTH_TOKEN;

  if (!dsn || !authToken) {
    return config;
  }

  return withSentryConfig(config, SENTRY_BUILD_OPTIONS);
}
