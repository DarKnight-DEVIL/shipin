import type { CarrierEvent, CarrierSnapshot, TrackingProvider } from "./types";

/**
 * Synthetic tracking feed used until the India Post UAT credentials are live.
 *
 * The data is a pure function of the carrier number and the current UTC day:
 * two calls on the same day return byte-identical events, so the sync layer's
 * dedupe works and repeated page views cannot grow the stored history, while
 * the feed keeps moving instead of fossilising at one fixed date. Nothing here
 * is presented as real — the provider is flagged `placeholder` and the UI says
 * the carrier feed is not connected yet.
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Midnight UTC today: the anchor that advances once per day. */
function rollingEpochMs(nowMs: number): number {
  return Math.floor(nowMs / DAY_MS) * DAY_MS;
}

const STAGES = [
  {
    code: "ITEM_BOOKED",
    description: "Item booked at the origin post office",
    location: "Mumbai, IN",
  },
  {
    code: "IN_TRANSIT",
    description: "In transit to the destination country",
    location: "Mumbai, IN",
  },
  {
    code: "CUSTOMS_CLEARANCE",
    description: "Undergoing customs clearance",
    location: "Destination country",
  },
] as const;

/** Stable small hash so the same tracking number always yields the same feed. */
function hash(value: string): number {
  let result = 0;

  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) % 100000;
  }

  return result;
}

export interface PlaceholderProviderOptions {
  /** Injectable clock, for tests that need a fixed day. */
  now?: () => number;
}

export function createPlaceholderProvider(
  options: PlaceholderProviderOptions = {}
): TrackingProvider {
  const now = options.now ?? Date.now;

  return {
    id: "placeholder",
    placeholder: true,

    async fetchTracking(carrierNumber: string): Promise<CarrierSnapshot> {
      const seed = hash(carrierNumber);
      // Three to five days ago: the scans have happened, the parcel is still
      // moving, so nothing looks stale and nothing is dated in the future.
      // One to four days back, varied by the number, so different parcels
      // do not share a timeline and no scan is dated in the future.
      const start =
        rollingEpochMs(now()) - MINUTE_MS * (24 * 60 + (seed % 3000));
      const stageCount = 2 + (seed % 2);

      const events: CarrierEvent[] = STAGES.slice(0, stageCount).map(
        (stage, index) => ({
          code: stage.code,
          description: stage.description,
          location: stage.location,
          occurredAt: new Date(start + index * 30 * HOUR_MS).toISOString(),
        })
      );

      return {
        carrierStatus: "in_transit",
        events,
        estimatedDelivery: new Date(start + 8 * DAY_MS)
          .toISOString()
          .slice(0, 10),
      };
    },
  };
}
