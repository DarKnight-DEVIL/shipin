import { serverEnv } from "@/config/env";
import { childLogger } from "@/lib/logger";

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
