import type { CarrierEvent, CarrierSnapshot, TrackingProvider } from "./types";

/**
 * Synthetic tracking feed used until the India Post UAT credentials are live.
 *
 * The data is a pure function of the carrier number, anchored to a fixed epoch:
 * calling it twice returns byte-identical events, so the sync layer's dedupe
 * works and repeated page views cannot grow the stored history. Nothing here
 * is presented as real — the provider is flagged `placeholder` and the UI says
 * the carrier feed is not connected yet.
 */

const BASE_EPOCH_MS = Date.UTC(2026, 0, 1);
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

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

export function createPlaceholderProvider(): TrackingProvider {
  return {
    id: "placeholder",
    placeholder: true,

    async fetchTracking(carrierNumber: string): Promise<CarrierSnapshot> {
      const seed = hash(carrierNumber);
      const start = BASE_EPOCH_MS + (seed % 180) * DAY_MS;
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
        estimatedDelivery: new Date(start + 12 * DAY_MS)
          .toISOString()
          .slice(0, 10),
      };
    },
  };
}
