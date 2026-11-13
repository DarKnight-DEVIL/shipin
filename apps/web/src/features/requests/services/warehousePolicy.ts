export function getStorageParams(
  _shippingPreference: string,
  _storageType?: string | null
) {
  return {
    dailyFine: 3,
    freeStorageDays: 7,
  };
}
