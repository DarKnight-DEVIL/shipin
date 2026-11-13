/**
 * @fileoverview Wallet feature – barrel export.
 */

export type { Wallet, WalletTransaction } from './types';

export {
  getWallet,
  depositToWallet,
  deductFromWallet,
  refundToWallet,
  getWalletTransactions,
} from './services/wallet';

export { adminCreditWallet } from './services/adminCreditWallet';

