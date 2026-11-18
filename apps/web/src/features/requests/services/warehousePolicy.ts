/**
 * Storage terms.
 *
 * The free window follows the service the customer bought: a parcel that ships
 * automatically cannot sit in the warehouse as long as one the customer asked us
 * to hold. The daily fine is flat today; the size tiers exist so pricing can be
 * set per size without touching call sites, and unknown sizes fall back to the
 * standard rate rather than failing a warehouse action.
 */
export const STORAGE_DAILY_FINE_USD = 3;

const FREE_STORAGE_DAYS_BY_PREFERENCE: Record<string, number> = {
  auto: 3,
  approval: 7,
  hold: 14,
};

const DAILY_FINE_BY_SIZE: Record<string, number> = {
  small: STORAGE_DAILY_FINE_USD,
  medium: STORAGE_DAILY_FINE_USD,
  large: STORAGE_DAILY_FINE_USD,
};

export function getStorageParams(
  shippingPreference: string,
  storageType?: string | null
) {
  return {
    dailyFine: DAILY_FINE_BY_SIZE[storageType ?? ""] ?? STORAGE_DAILY_FINE_USD,
    freeStorageDays: FREE_STORAGE_DAYS_BY_PREFERENCE[shippingPreference] ?? 7,
  };
}
