import {
  CarrierNotConfiguredError,
  CarrierRequestError,
  type CarrierEvent,
  type CarrierSnapshot,
  type TrackingProvider,
} from "./types";

/**
 * India Post (CEPT) tracking adapter.
 *
 * The transport is real, the payload mapping is an **allowlist**: only status,
 * event code, description, location, date and the expected delivery date are
 * read out of the response. Postage, tariff and charge fields — whatever CEPT
 * names them — are never copied into `CarrierSnapshot`, so they cannot leak
 * into Firestore or a customer's tracking page.
 *
 * Point `INDIA_POST_TRACKING_URL` at the UAT endpoint once CEPT whitelists the
 * Azure proxy IP; the placeholder feed is used automatically until all three
 * India Post variables are present.
 */

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_EVENTS = 100;

export interface IndiaPostConfig {
  endpoint: string;
  clientId: string;
  clientSecret: string;
  timeoutMs?: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Normalise a carrier date to ISO-8601 UTC, or drop it. */
function toIsoDate(value: unknown): string | undefined {
  if (typeof value === "number") {
    const fromNumber = new Date(value);
    return Number.isNaN(fromNumber.getTime()) ? undefined : fromNumber.toISOString();
  }

  const text = asString(value);
  if (!text) return undefined;

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/** Carrier status words become stable lower snake case. */
export function normalizeCarrierStatus(value: unknown): string {
  const text = asString(value);
  if (!text) return "unknown";

  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown";
}

/**
 * Map a CEPT tracking response onto our carrier snapshot.
 *
 * Accepts either a bare payload or one wrapped in `{ data: … }`, which their
 * gateway uses inconsistently between UAT and production.
 */
export function mapIndiaPostResponse(payload: unknown): CarrierSnapshot {
  const root = asRecord(payload) ?? {};
  const data = asRecord(root.data) ?? root;

  const rawEvents =
    asArray(data.events).length > 0
      ? asArray(data.events)
      : asArray(data.trackingEvents).length > 0
        ? asArray(data.trackingEvents)
        : asArray(data.statuses);

  const events: CarrierEvent[] = [];

  for (const raw of rawEvents.slice(0, MAX_EVENTS)) {
    const event = asRecord(raw);
    if (!event) continue;

    const occurredAt = toIsoDate(
      event.eventDate ?? event.date ?? event.timestamp ?? event.occurredAt
    );

    const description = asString(
      event.eventDescription ?? event.description ?? event.narration
    );

    const code = asString(event.eventCode ?? event.code ?? event.status);

    if (!occurredAt || !description || !code) continue;

    const location = asString(
      event.officeName ?? event.location ?? event.office ?? event.city
    );

    events.push({
      code,
      description,
      ...(location ? { location } : {}),
      occurredAt,
    });
  }

  const estimatedDelivery = toIsoDate(
    data.expectedDelivery ?? data.deliveryDate ?? data.estimatedDelivery
  )?.slice(0, 10);

  return {
    carrierStatus: normalizeCarrierStatus(
      data.status ?? data.currentStatus ?? data.deliveryStatus ?? events.at(-1)?.code
    ),
    events,
    ...(estimatedDelivery ? { estimatedDelivery } : {}),
  };
}

export function createIndiaPostProvider(
  config: IndiaPostConfig
): TrackingProvider {
  const { endpoint, clientId, clientSecret, timeoutMs = DEFAULT_TIMEOUT_MS } =
    config;

  return {
    id: "indiapost",
    placeholder: false,

    async fetchTracking(carrierNumber: string): Promise<CarrierSnapshot> {
      if (!endpoint || !clientId || !clientSecret) {
        throw new CarrierNotConfiguredError("India Post");
      }

      const authorization = Buffer.from(
        `${clientId}:${clientSecret}`,
        "utf8"
      ).toString("base64");

      let response: Response;

      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${authorization}`,
          },
          body: JSON.stringify({ trackingNumber: carrierNumber }),
          signal: AbortSignal.timeout(timeoutMs),
          cache: "no-store",
        });
      } catch (error) {
        throw new CarrierRequestError(
          "India Post",
          error instanceof Error
            ? `India Post tracking request failed: ${error.message}`
            : "India Post tracking request failed."
        );
      }

      if (!response.ok) {
        throw new CarrierRequestError(
          "India Post",
          `India Post tracking returned ${response.status}.`,
          response.status
        );
      }

      try {
        return mapIndiaPostResponse(await response.json());
      } catch {
        throw new CarrierRequestError(
          "India Post",
          "India Post returned a response that could not be read."
        );
      }
    },
  };
}
