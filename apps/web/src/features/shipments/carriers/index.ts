import { isProduction, serverEnv } from "@/config/env";
import { childLogger } from "../../../lib/logger";

import { createIndiaPostProvider } from "./indiaPostProvider";
import { createPlaceholderProvider } from "./placeholderProvider";
import type { TrackingProvider } from "./types";

/**
 * Chooses the tracking feed.
 *
 * India Post is used only when all three credentials are present, so a partial
 * configuration (say, the URL pasted in before CEPT issues a client id) falls
 * back to the placeholder feed instead of failing customer-facing tracking.
 */
let warnedAboutPlaceholder = false;

/**
 * Say once per process why tracking is synthetic. Without this an operator can
 * believe the carrier feed is live: the customer page looks plausible either
 * way, and the only other signal is the provider id on the snapshot.
 */
function warnPlaceholderInUse(missing: string[]): void {
  if (warnedAboutPlaceholder) return;
  warnedAboutPlaceholder = true;

  childLogger({ service: "tracking" }).warn(
    `India Post is not configured (missing: ${missing.join(", ")}); customer tracking is serving the placeholder feed, not carrier data.`
  );
}

/**
 * Configuration status of the carrier feed, shared by the startup warning and
 * /api/health so both read one definition (the same split the rate-limit
 * store uses). A missing configuration in production is a degraded
 * deployment, not a fatal one: the tracking page keeps working and discloses
 * the placeholder, but monitoring must see the gap.
 */
export interface IndiaPostStatus {
  configured: boolean;
  /** True only in production without the full credential set. */
  degraded: boolean;
}

export function getIndiaPostStatus(): IndiaPostStatus {
  const configured = isIndiaPostConfigured();
  return { configured, degraded: isProduction && !configured };
}

/**
 * Startup reporter for instrumentation.ts. Mirrors
 * `reportRateLimitStoreStatus`: warn (never throw) so a human can fix the
 * variables live, while /api/health reports `degraded` for monitoring.
 */
export function reportIndiaPostStatus(): IndiaPostStatus {
  const status = getIndiaPostStatus();

  if (status.degraded) {
    childLogger({ service: "tracking" }).warn(
      "[Tracking] INDIA_POST_TRACKING_URL / INDIA_POST_CLIENT_ID / INDIA_POST_CLIENT_SECRET are not fully set in production. " +
        "Customer tracking is serving the placeholder feed; /api/health reports this as degraded."
    );
  }

  return status;
}

export function getTrackingProvider(): TrackingProvider {
  const endpoint = serverEnv.INDIA_POST_TRACKING_URL;
  const clientId = serverEnv.INDIA_POST_CLIENT_ID;
  const clientSecret = serverEnv.INDIA_POST_CLIENT_SECRET;

  if (endpoint && clientId && clientSecret) {
    return createIndiaPostProvider({ endpoint, clientId, clientSecret });
  }

  const missing = [
    !endpoint ? "INDIA_POST_TRACKING_URL" : null,
    !clientId ? "INDIA_POST_CLIENT_ID" : null,
    !clientSecret ? "INDIA_POST_CLIENT_SECRET" : null,
  ].filter((name): name is string => name !== null);

  warnPlaceholderInUse(missing);

  return createPlaceholderProvider();
}

export function isIndiaPostConfigured(): boolean {
  return Boolean(
    serverEnv.INDIA_POST_TRACKING_URL &&
    serverEnv.INDIA_POST_CLIENT_ID &&
    serverEnv.INDIA_POST_CLIENT_SECRET
  );
}

export * from "./types";
export {
  createIndiaPostProvider,
  mapIndiaPostResponse,
  normalizeCarrierStatus,
} from "./indiaPostProvider";
export { createPlaceholderProvider } from "./placeholderProvider";
