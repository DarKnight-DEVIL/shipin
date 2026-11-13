import { serverEnv } from "@/config/env";

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
export function getTrackingProvider(): TrackingProvider {
  const endpoint = serverEnv.INDIA_POST_TRACKING_URL;
  const clientId = serverEnv.INDIA_POST_CLIENT_ID;
  const clientSecret = serverEnv.INDIA_POST_CLIENT_SECRET;

  if (endpoint && clientId && clientSecret) {
    return createIndiaPostProvider({ endpoint, clientId, clientSecret });
  }

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
export { createIndiaPostProvider, mapIndiaPostResponse, normalizeCarrierStatus } from "./indiaPostProvider";
export { createPlaceholderProvider } from "./placeholderProvider";
