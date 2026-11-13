/**
 * DPDP Act 2023 - Retention Cleanup (Core)
 */

export interface CleanupResult {
  deleted: number;
  errors: string[];
  details: Array<{ collection: string; docId: string; reason: string }>;
}

/**
 * Collections mapped by category
 */
export function getCollectionsForCategory(category: string): string[] {
  const map: Record<string, string[]> = {
    account: ['users'],
    shipping: ['requests', 'users'],
    order: ['requests'],
    payment: ['walletTransactions', 'paypalPaymentOrders', 'requests'],
    support: ['supportTickets', 'supportMessages', 'notifications'],
    auth: ['users'],
    analytics: [], // Handled by Vercel
    marketing: ['users'], // Consent logs
    cookie: [], // Client-side only
  };
  return map[category] || [];
}

/**
 * Check if document has legal hold
 */
export function hasLegalHold(category: string, data: Record<string, unknown>): boolean {
  if (data.legalHold === true) return true;
  if (data.litigationHold === true) return true;
  if (data.auditHold === true) return true;
  return false;
}

/**
 * Determine if category should be hard deleted or soft deleted
 */
export function shouldHardDelete(category: string): boolean {
  const hardDeleteCategories = ['analytics', 'marketing', 'cookie', 'auth'];
  return hardDeleteCategories.includes(category);
}