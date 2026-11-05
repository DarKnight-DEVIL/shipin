/**
 * Server-only barrel for Firebase Admin SDK service functions.
 *
 * Import this ONLY from server-side code (API routes, Server Components).
 * Client components must call API routes instead of importing these
 * functions directly, since firebase-admin cannot run in the browser.
 */

import "server-only";

export {
  saveDetailedQuote,
  acceptQuote,
  regenerateQuote,
} from '@/features/requests/services/quotes';

export {
  saveShipmentDetails,
  updateShipmentStatus,
} from '@/features/requests/services/shipments';