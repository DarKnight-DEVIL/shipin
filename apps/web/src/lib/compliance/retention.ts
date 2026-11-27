/**
 * The retention schedule published in the Privacy Policy (§8), as code.
 *
 * The policy promised periods that nothing enforced. These helpers are the
 * single definition of "expired" that the purge job and its tests share, so the
 * page and the cron cannot drift apart again: change a number here and the
 * policy table is the only other place to edit.
 */

/** Inspection and packing photos: 24 months after delivery. */
export const PHOTO_RETENTION_MONTHS = 24;

/** Support conversations: 24 months after the ticket is resolved. */
export const SUPPORT_RETENTION_MONTHS = 24;

/**
 * PayPal webhook idempotency markers (`paypalWebhookEvents/{eventId}`): 30 days.
 *
 * A marker only has to live as long as PayPal might redeliver the same event —
 * its own retry window is about three days, so thirty is generous. Anything
 * older can never be consulted again and is deleted by the daily purge.
 */
export const WEBHOOK_EVENT_RETENTION_DAYS = 30;

/**
 * Orders, invoices and payment records: 8 years, for tax and accounting law.
 * Documented here for completeness; the purge deliberately never deletes these.
 */
export const FINANCIAL_RECORD_RETENTION_YEARS = 8;

/**
 * `now` shifted back by `months`, clamped to a real calendar date.
 *
 * A plain `setMonth` is wrong at month ends: 31 March minus one month becomes
 * "31 February", which JavaScript silently rolls into 3 March. Clamping keeps
 * the cutoff at the last valid day instead.
 */
export function retentionCutoff(months: number, now: Date = new Date()): Date {
  const cutoff = new Date(now.getTime());
  const day = cutoff.getUTCDate();

  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);

  const lastDayOfMonth = new Date(
    Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)
  ).getUTCDate();

  cutoff.setUTCDate(Math.min(day, lastDayOfMonth));
  return cutoff;
}

/**
 * Reads a stored timestamp as epoch milliseconds.
 *
 * Documents in this codebase carry three shapes: Firestore `Timestamp`, ISO
 * strings (support tickets) and occasionally `Date`. Anything unrecognised is
 * null, which callers treat as "not expired" — deleting records because a field
 * failed to parse would be the worst possible failure mode here.
 */
export function toEpochMs(value: unknown): number | null {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }

  if (typeof value === "string") {
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : null;
  }

  if (typeof value === "object" && value !== null) {
    const candidate = value as { toDate?: () => Date; seconds?: number };
    if (typeof candidate.toDate === "function") {
      const time = candidate.toDate().getTime();
      return Number.isFinite(time) ? time : null;
    }
    if (typeof candidate.seconds === "number") {
      return candidate.seconds * 1000;
    }
  }

  return null;
}

/** Whether a stored timestamp is older than `months`. Unparseable input is not expired. */
export function isPastRetention(
  value: unknown,
  months: number,
  now: Date = new Date()
): boolean {
  const time = toEpochMs(value);
  if (time === null) return false;

  return time <= retentionCutoff(months, now).getTime();
}

/**
 * The R2 key for one stored photo entry.
 *
 * `warehouse.inspectionPhotos` has held two shapes: a bare key string (what the
 * request page presigns) and an object `{ id, url, caption, uploadedAt }` (what
 * the admin upload route appends). Both must be deletable, and anything else is
 * ignored rather than guessed at.
 */
export function photoStorageKey(entry: unknown): string | null {
  if (typeof entry === "string") {
    const key = entry.trim();
    return key === "" ? null : key;
  }

  if (typeof entry === "object" && entry !== null) {
    const url = (entry as { url?: unknown }).url;
    if (typeof url === "string" && url.trim() !== "") return url.trim();
  }

  return null;
}

/** Every R2 key a request document still points at. */
export function collectPhotoKeys(warehouse: unknown): string[] {
  if (typeof warehouse !== "object" || warehouse === null) return [];

  const record = warehouse as {
    inspectionPhotos?: unknown;
    photos?: unknown;
    packingPhotos?: unknown;
    shippingLabel?: unknown;
  };

  const keys = new Set<string>();

  for (const list of [record.inspectionPhotos, record.photos, record.packingPhotos]) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const key = photoStorageKey(entry);
      if (key) keys.add(key);
    }
  }

  const label = photoStorageKey(record.shippingLabel);
  if (label) keys.add(label);

  return Array.from(keys);
}
