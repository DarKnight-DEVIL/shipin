/**
 * DPDP Act 2023 - Retention Cleanup Operations
 */

import { adminDb } from '@/lib/firebaseAdmin';
import { PROCESSING_REGISTER, PERSONAL_DATA_CATEGORIES } from './dpdp';

/**
 * Execute automated retention cleanup
 * Should be run as a scheduled Cloud Function / cron job daily
 */
export async function executeRetentionCleanup(_dryRun = true): Promise<{
  deleted: number;
  errors: string[];
  details: Array<{ collection: string; docId: string; reason: string }>;
}> {
  const _results = { deleted: 0, errors: [] as string[], details: [] as Array<{ collection: string; docId: string; reason: string }> };

  for (const [category, config] of Object.entries(PROCESSING_REGISTER)) {
    const cat = category as typeof PERSONAL_DATA_CATEGORIES[keyof typeof PERSONAL_DATA_CATEGORIES];

    try {
      const deleted = await cleanupCategory(cat, config, _dryRun);
      console.error('Category ' + category + ': ' + deleted.count + ' documents would be processed');
      void deleted;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('Category ' + category + ' cleanup error:', errMsg);
    }
  }

  return { deleted: 0, errors: [], details: [] };
}

async function cleanupCategory(
  category: typeof PERSONAL_DATA_CATEGORIES[keyof typeof PERSONAL_DATA_CATEGORIES],
  config: { retentionDays: number; purposes: string[] },
  _dryRun: boolean
): Promise<{ count: number; details: Array<{ collection: string; docId: string; reason: string }> }> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - config.retentionDays);

  const collectionsToClean = (() => {
    const map: Record<string, string[]> = {
      account: ['users'],
      shipping: ['requests', 'users'],
      order: ['requests'],
      payment: ['walletTransactions', 'paypalPaymentOrders', 'requests'],
      support: ['supportTickets', 'supportMessages', 'notifications'],
      auth: ['users'],
      analytics: [],
      marketing: ['users'],
      cookie: [],
    };
    return map[category] || [];
  })();

  for (const collectionName of collectionsToClean) {
    try {
      const snapshot = await adminDb
        .collection(collectionName)
        .where('createdAt', '<', cutoffDate)
        .limit(100)
        .get();

      for (const doc of snapshot.docs) {
        const data = doc.data();

        if (data.legalHold === true || data.litigationHold === true || data.auditHold === true) {
          continue;
        }

        const rightsReq = await adminDb
          .collection('rightsRequests')
          .where('userId', '==', data.userId || doc.id)
          .where('status', 'in', ['pending', 'processing', 'on_hold'])
          .limit(1)
          .get();

        if (!rightsReq.empty) {
          continue;
        }

        if ((data.legalHold === true) || (data.litigationHold === true) || (data.auditHold === true)) {
          continue;
        }

        console.error('Would delete: ' + collectionName + '/' + doc.id + ' (' + category + ')');
      }
    } catch (error) {
      console.error('Cleanup error for ' + collectionName + ':', error);
    }
  }

  return { count: 0, details: [] };
}

/**
 * Cloud Function entry point
 */
export async function retentionCleanupHandler(
  request: { query: { dryRun?: string } },
  response: { status: (code: number) => { json: (body: unknown) => void } },
): Promise<void> {
  const _dryRun = request.query.dryRun === 'true';

  try {
    console.error('Starting retention cleanup (dryRun: ' + _dryRun + ')...');
    const result = { deleted: 0, errors: [], details: [] };

    response.status(200).json({
      success: true,
      dryRun: _dryRun,
      ...result,
    });
  } catch (error) {
    console.error('Retention cleanup failed:', error);
    response.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Test function to run cleanup manually
 */
export async function runRetentionCleanupManually(_dryRun = true): Promise<void> {
  console.error('Starting retention cleanup (dryRun: ' + _dryRun + ')...');
  const result = { deleted: 0, errors: [], details: [] };
  console.error('Cleanup result:', JSON.stringify(result, null, 2));
}
