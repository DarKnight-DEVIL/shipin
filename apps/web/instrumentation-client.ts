/**
 * Browser-side instrumentation entry point (Next 15.3+/16).
 *
 * Without this file the client SDK is never initialised: `sentry.client.config.ts`
 * existed but nothing imported it, so no browser error, rejection or CSP-related
 * client failure was ever reported. The config itself no-ops outside production
 * and without NEXT_PUBLIC_SENTRY_DSN.
 */
import "./sentry.client.config";
