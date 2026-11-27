/**
 * Parse what a customer pastes into the public tracking form.
 *
 * They may type the ShipIN number, paste a full `/track/...` link (including
 * the `?token=` a legacy id needs), or paste the API path. Keeping this pure and
 * client-safe means the form can forward the token without ever knowing the
 * signing secret.
 */

export interface TrackingLookup {
  trackingId: string;
  token?: string;
}

export function parseTrackingLookup(raw: string): TrackingLookup | null {
  const value = raw.trim();
  if (!value) return null;

  if (/^https?:\/\//i.test(value) || /^\/track\//.test(value)) {
    try {
      const url = new URL(value, "https://shipin.invalid");
      const segments = url.pathname.split("/").filter(Boolean);
      const trackIndex = segments.lastIndexOf("track");
      const rawId =
        trackIndex >= 0 ? segments[trackIndex + 1] : segments.at(-1);

      if (!rawId) return null;

      const token = url.searchParams.get("token") ?? undefined;

      return {
        trackingId: decodeURIComponent(rawId),
        ...(token ? { token } : {}),
      };
    } catch {
      return null;
    }
  }

  const queryIndex = value.indexOf("?");
  const rawId = (queryIndex === -1 ? value : value.slice(0, queryIndex)).trim();

  if (!rawId) return null;

  const token =
    queryIndex === -1
      ? undefined
      : new URLSearchParams(value.slice(queryIndex + 1)).get("token") ??
        undefined;

  return { trackingId: rawId, ...(token ? { token } : {}) };
}
