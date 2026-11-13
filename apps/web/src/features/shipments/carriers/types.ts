/**
 * Carrier-agnostic tracking shapes.
 *
 * These types deliberately contain no money fields. A carrier response passes
 * through an allowlist mapper before it reaches storage or a client, so the
 * tariffs India Post charges us stay server-side even if their payload grows.
 */

export interface CarrierEvent {
  /** Carrier's own event code, e.g. `ITEM_DELIVERED`. */
  code: string;
  /** Human description, safe to show a customer. */
  description: string;
  location?: string;
  /** ISO-8601 UTC timestamp. */
  occurredAt: string;
}

export interface CarrierSnapshot {
  /** Raw carrier status word, normalised to lower snake case. */
  carrierStatus: string;
  events: CarrierEvent[];
  estimatedDelivery?: string;
}

export type TrackingProviderId = "indiapost" | "placeholder";

export interface TrackingProvider {
  id: TrackingProviderId;
  /** True when the data is synthetic rather than a live carrier feed. */
  placeholder: boolean;
  fetchTracking(carrierNumber: string): Promise<CarrierSnapshot>;
}

/** The adapter exists but has no credentials/endpoint yet. */
export class CarrierNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`${provider} tracking is not configured.`);
    this.name = "CarrierNotConfiguredError";
  }
}

/** The carrier was reachable but answered with an error. */
export class CarrierRequestError extends Error {
  constructor(
    provider: string,
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "CarrierRequestError";
  }
}
