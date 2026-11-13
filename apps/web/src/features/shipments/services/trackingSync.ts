import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import {
  getTrackingProvider,
  type CarrierEvent,
  type TrackingProvider,
} from "@/features/shipments/carriers";

/**
 * The tracking proxy.
 *
 * Customers are given a ShipIN number (`SHP-YYYY-NNNNNN`). That number is the
 * only thing they ever send us; the India Post consignment number stays in the
 * request document and is never exposed. Everything below is about pulling the
 * carrier feed efficiently:
 *
 *  - **Cache first.** A sync is at most one upstream call per
 *    TRACKING_CACHE_TTL_MS per shipment, no matter how often the page is
 *    refreshed.
 *  - **Stop at the end.** Once the carrier (or the request itself) says
 *    delivered, `tracking.syncPaused` is set and no further upstream calls are
 *    made for that shipment, ever — the API quota is finite.
 *  - **Bounded storage.** Events are deduped and capped at MAX_STORED_EVENTS,
 *    so repeatedly polling a long shipment cannot grow the document without
 *    limit.
 *  - **No tariffs.** Only the allowlisted carrier fields are stored, and the
 *    projection returned to the client is built field by field.
 */

export const TRACKING_CACHE_TTL_MS = 15 * 60 * 1000;
export const MAX_STORED_EVENTS = 40;

/** Request statuses that mean the parcel's journey is over. */
const TERMINAL_REQUEST_STATUSES = new Set(["delivered", "refunded", "rejected"]);

/** Carrier statuses that mean the parcel is delivered. */
const DELIVERED_CARRIER_STATUSES = new Set([
  "delivered",
  "delivery_completed",
  "item_delivered",
  "delivered_to_addressee",
]);

export interface PublicTrackingEvent {
  code: string;
  description: string;
  location?: string;
  occurredAt: string;
}

export type SyncPauseReason =
  | "delivered"
  | "terminal_status"
  | "no_carrier_number"
  | null;

export interface PublicTracking {
  trackingId: string;
  status: string;
  carrier: string | null;
  estimatedDelivery: string | null;
  createdAt: string | null;
  statusHistory: Record<string, unknown>;
  events: PublicTrackingEvent[];
  carrierStatus: string | null;
  lastSyncedAt: string | null;
  syncPaused: boolean;
  syncPauseReason: SyncPauseReason;
  /** Where the numbers came from: stored copy, live carrier, or placeholder. */
  source: "cache" | "carrier" | "placeholder";
  /** Set when the live feed failed but a cached answer was good enough. */
  notice?: string;
}

export interface ResolveTrackingOptions {
  provider?: TrackingProvider;
  now?: () => number;
  /**
   * Staff-initiated refresh: ignore both the cache window and the "stop when
   * delivered" rule, then restore the normal policy. Used by the admin
   * tracking panel to pick up late scans on a parcel the carrier already
   * reported as delivered.
   */
  force?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/** Accepts Firestore Timestamp, Date, ISO string or epoch millis. */
function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const record = asRecord(value);

  if (record && typeof record.toDate === "function") {
    const parsed = (record.toDate as () => Date)();
    return parsed instanceof Date && !Number.isNaN(parsed.getTime())
      ? parsed.toISOString()
      : null;
  }

  if (record && typeof record.seconds === "number") {
    return new Date(record.seconds * 1000).toISOString();
  }

  return null;
}

function toMillis(value: unknown): number | null {
  const iso = toIso(value);
  return iso ? new Date(iso).getTime() : null;
}

/** Whitelist one stored or carrier event. */
function normalizeEvent(raw: unknown): PublicTrackingEvent | null {
  const event = asRecord(raw);
  if (!event) return null;

  const code = typeof event.code === "string" ? event.code.trim() : "";
  const description =
    typeof event.description === "string" ? event.description.trim() : "";
  const occurredAt = toIso(event.occurredAt);

  if (!code || !description || !occurredAt) return null;

  const location =
    typeof event.location === "string" && event.location.trim()
      ? event.location.trim()
      : undefined;

  return { code, description, occurredAt, ...(location ? { location } : {}) };
}

function normalizeEvents(raw: unknown): PublicTrackingEvent[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map(normalizeEvent)
    .filter((event): event is PublicTrackingEvent => event !== null);
}

/**
 * Merge stored and fresh events: newest first, identical entries collapsed,
 * length capped. Carriers resend their whole history on every poll, so the
 * dedupe is what keeps the document from growing.
 */
export function mergeEvents(
  stored: PublicTrackingEvent[],
  incoming: CarrierEvent[],
  limit: number = MAX_STORED_EVENTS
): PublicTrackingEvent[] {
  const merged = new Map<string, PublicTrackingEvent>();

  for (const event of [...stored, ...normalizeEvents(incoming)]) {
    const key = `${event.code}|${event.occurredAt}|${event.location ?? ""}`;
    if (!merged.has(key)) merged.set(key, event);
  }

  return [...merged.values()]
    .sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    )
    .slice(0, limit);
}

interface FoundRequest {
  id: string;
  data: Record<string, unknown>;
}

/**
 * Resolve a request by its ShipIN tracking id.
 *
 * The tracking id normally lives at `tracking.internalTrackingId`; the direct
 * document-id lookup is kept so links minted before the proxy existed still
 * work.
 */
async function findRequest(trackingId: string): Promise<FoundRequest | null> {
  const byInternalId = await adminDb
    .collection("requests")
    .where("tracking.internalTrackingId", "==", trackingId)
    .limit(1)
    .get();

  if (!byInternalId.empty) {
    const snapshot = byInternalId.docs[0];
    return { id: snapshot.id, data: (snapshot.data() ?? {}) as Record<string, unknown> };
  }

  const direct = await adminDb.collection("requests").doc(trackingId).get();

  if (!direct.exists) return null;

  return {
    id: direct.id,
    data: (direct.data() ?? {}) as Record<string, unknown>,
  };
}

function project(
  id: string,
  data: Record<string, unknown>,
  events: PublicTrackingEvent[],
  source: PublicTracking["source"],
  options: {
    syncPaused: boolean;
    syncPauseReason: SyncPauseReason;
    notice?: string;
  }
): PublicTracking {
  const tracking = asRecord(data.tracking) ?? {};

  return {
    trackingId:
      (typeof tracking.internalTrackingId === "string" &&
        tracking.internalTrackingId) ||
      id,
    status: typeof data.status === "string" ? data.status : "unknown",
    carrier:
      typeof tracking.carrier === "string"
        ? tracking.carrier
        : typeof data.carrier === "string"
          ? data.carrier
          : null,
    estimatedDelivery:
      (typeof tracking.estimatedDelivery === "string" &&
        tracking.estimatedDelivery) ||
      (typeof data.estimatedDelivery === "string" && data.estimatedDelivery) ||
      null,
    createdAt: toIso(data.createdAt ?? tracking.createdAt),
    statusHistory: asRecord(data.statusHistory) ?? {},
    events,
    carrierStatus:
      typeof tracking.carrierStatus === "string" ? tracking.carrierStatus : null,
    lastSyncedAt: toIso(tracking.lastSyncedAt),
    syncPaused: options.syncPaused,
    syncPauseReason: options.syncPauseReason,
    source,
    ...(options.notice ? { notice: options.notice } : {}),
  };
}

/**
 * Return what the tracking page should show, calling the carrier only when the
 * cached copy is stale and the journey is still running.
 *
 * Returns `null` when no request carries that tracking id.
 */
export async function resolveTracking(
  rawTrackingId: string,
  options: ResolveTrackingOptions = {}
): Promise<PublicTracking | null> {
  const trackingId = rawTrackingId.trim();
  if (!trackingId) return null;

  const found = await findRequest(trackingId);
  if (!found) return null;

  const { id, data } = found;
  const tracking = asRecord(data.tracking) ?? {};
  const storedEvents = normalizeEvents(tracking.events);

  const requestStatus = typeof data.status === "string" ? data.status : "unknown";
  const terminalStatus = TERMINAL_REQUEST_STATUSES.has(requestStatus);
  const alreadyDelivered =
    tracking.syncPaused === true || Boolean(tracking.deliveredAt);

  const force = options.force === true;

  if (!force && (terminalStatus || alreadyDelivered)) {
    return project(id, data, storedEvents, "cache", {
      syncPaused: true,
      syncPauseReason: alreadyDelivered ? "delivered" : "terminal_status",
    });
  }

  const now = options.now ?? Date.now;
  const lastSyncedAt = toMillis(tracking.lastSyncedAt);
  const cacheFresh =
    lastSyncedAt !== null && now() - lastSyncedAt < TRACKING_CACHE_TTL_MS;

  if (!force && cacheFresh) {
    return project(id, data, storedEvents, "cache", {
      syncPaused: false,
      syncPauseReason: null,
    });
  }

  const carrierNumber =
    (typeof tracking.trackingNumber === "string" && tracking.trackingNumber) ||
    (typeof data.trackingNumber === "string" && data.trackingNumber) ||
    "";

  if (!carrierNumber) {
    return project(id, data, storedEvents, "cache", {
      syncPaused: true,
      syncPauseReason: "no_carrier_number",
      notice: "Carrier tracking will appear once the parcel is handed over.",
    });
  }

  const provider = options.provider ?? getTrackingProvider();

  let snapshot;
  try {
    snapshot = await provider.fetchTracking(carrierNumber);
  } catch (error) {
    // A carrier hiccup must not blank out a page that has a usable answer.
    if (storedEvents.length > 0) {
      return project(id, data, storedEvents, "cache", {
        syncPaused: false,
        syncPauseReason: null,
        notice: "Live updates are temporarily unavailable. Showing the last known status.",
      });
    }

    throw error;
  }

  const events = mergeEvents(storedEvents, snapshot.events);
  const delivered = DELIVERED_CARRIER_STATUSES.has(snapshot.carrierStatus);

  const updates: Record<string, unknown> = {
    "tracking.events": events,
    "tracking.lastSyncedAt": FieldValue.serverTimestamp(),
    "tracking.carrierStatus": snapshot.carrierStatus,
    "tracking.provider": provider.id,
    "tracking.syncPaused": delivered,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (snapshot.estimatedDelivery) {
    updates["tracking.estimatedDelivery"] = snapshot.estimatedDelivery;
  }

  if (delivered) {
    updates["tracking.deliveredAt"] = FieldValue.serverTimestamp();

    // Only the last leg may be closed from here; the rest of the status
    // machine stays with the admin shipment controls.
    if (requestStatus === "out_for_delivery") {
      updates.status = "delivered";
      updates["statusHistory.delivered"] = FieldValue.serverTimestamp();
    }
  }

  await adminDb.collection("requests").doc(id).update(updates);

  const nextData: Record<string, unknown> = {
    ...data,
    status: (updates.status as string | undefined) ?? requestStatus,
    tracking: {
      ...tracking,
      events,
      carrierStatus: snapshot.carrierStatus,
      ...(snapshot.estimatedDelivery
        ? { estimatedDelivery: snapshot.estimatedDelivery }
        : {}),
      lastSyncedAt: new Date(now()).toISOString(),
      ...(delivered ? { syncPaused: true } : {}),
    },
  };

  // A forced refresh may re-open a shipped parcel's polling if the carrier no
  // longer reports it delivered; a closed request stays closed.
  const paused = delivered || terminalStatus;

  return project(id, nextData, events, provider.placeholder ? "placeholder" : "carrier", {
    syncPaused: paused,
    syncPauseReason: delivered
      ? "delivered"
      : terminalStatus
        ? "terminal_status"
        : null,
  });
}
