
/**
 * Address book barrel.
 * Re-exports from the legacy addresses service.
 */

export {
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  getDefaultAddress,
} from '@/features/requests/services/addressesLegacy';