/**
 * @fileoverview Addresses feature – barrel export.
 *
 * All address-related types, services, and hooks are re-exported from this
 * entry point so consumers import from `@/features/addresses` instead of
 * walking into subdirectories.
 */

export type { Address } from '@/types/address';

export {
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  getDefaultAddress,
} from './services/addresses';
