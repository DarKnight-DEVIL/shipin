/**
 * DPDP Act 2023 - Retention Cleanup Operations
 *
 * Walks the processing register and deletes documents whose retention period
 * has expired. Deletion is refused for anything under a legal/litigation/audit
 * hold or whose owner has an open data-subject request, so a sweep can never
 * destroy evidence it is required to keep.
 *
 * `executeRetentionCleanup` defaults to a dry run: callers must pass `false` to
 * delete. A scheduled job that silently deletes on a typo is worse than a job
 * that reports what it would do.
 */

import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { logger } from '@/lib/logger';
import { PERSONAL_DATA_CATEGORIES, PROCESSING_REGISTER } from './dpdp';

/** Firestore allows 500 writes per batch; one page per collection is 100. */
const PAGE_SIZE = 100;

export interface RetentionDetail {
  collection: string;
  docId: string;
  reason: string;
}

export interface RetentionResult {
  /** Documents actually deleted (always 0 in a dry run). */
  deleted: number;
  /** Documents examined and found past their retention period. */
  expired: number;
  /** Expired documents kept because of a hold or an open rights request. */
  skipped: number;
  errors: string[];
  details: RetentionDetail[];
}

export type RetentionCategory =
  (typeof PERSONAL_DATA_CATEGORIES)[keyof typeof PERSONAL_DATA_CATEGORIES];

/** Collections each register category is allowed to touch. */
const COLLECTIONS_BY_CATEGORY: Record<string, string[]> = {
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

/** Hold flags that make a document ineligible regardless of age. */
const HOLD_FLAGS = ['legalHold', 'litigationHold', 'auditHold'] as const;

function hasHold(data: Record<string, unknown>): boolean {
  return HOLD_FLAGS.some((flag) => data[flag] === true);
}

/**
 * A `users` document is only expired once the account itself is closed. Active
 * accounts are retained for their lifetime, so age alone must never delete one:
 * that would remove the profile while the Auth account kept signing in.
 */
function isClosedAccount(data: Record<string, unknown>): boolean {
  return Boolean(data.deletedAt || data.deletionRequestedAt || data.anonymizedAt);
}

function emptyResult(): RetentionResult {
  return { deleted: 0, expired: 0, skipped: 0, errors: [], details: [] };
}

function merge(into: RetentionResult, from: RetentionResult): void {
  into.deleted += from.deleted;
  into.expired += from.expired;
  into.skipped += from.skipped;
  into.errors.push(...from.errors);
  into.details.push(...from.details);
}

/**
 * Execute retention cleanup. `dryRun` defaults to true; pass false to delete.
 */
export async function executeRetentionCleanup(dryRun = true): Promise<RetentionResult> {
  const totals = emptyResult();
  // The register maps several categories to the same collection. One document
  // is processed once, however many categories cover it.
  const handled = new Set<string>();

  for (const [category, config] of Object.entries(PROCESSING_REGISTER)) {
    try {
      merge(
        totals,
        await cleanupCategory(category as RetentionCategory, config, dryRun, handled)
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      totals.errors.push(`${category}: ${message}`);
      logger.error('Retention cleanup failed for category', { category, error: message });
    }
  }

  logger.info('Retention cleanup finished', {
    dryRun,
    deleted: totals.deleted,
    expired: totals.expired,
    skipped: totals.skipped,
    errors: totals.errors.length,
  });

  return totals;
}

async function cleanupCategory(
  category: RetentionCategory,
  config: { retentionDays: number; purposes: string[] },
  dryRun: boolean,
  handled: Set<string>
): Promise<RetentionResult> {
  const result = emptyResult();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - config.retentionDays);

  for (const collectionName of COLLECTIONS_BY_CATEGORY[category] ?? []) {
    try {
      const snapshot = await adminDb
        .collection(collectionName)
        .where('createdAt', '<', cutoff)
        .limit(PAGE_SIZE)
        .get();

      const batch = adminDb.batch();
      let queued = 0;

      for (const doc of snapshot.docs) {
        const data = (doc.data() ?? {}) as Record<string, unknown>;

        if (collectionName === 'users' && !isClosedAccount(data)) {
          result.skipped += 1;
          continue;
        }

        if (hasHold(data)) {
          result.skipped += 1;
          continue;
        }

        const ownerId = typeof data.userId === 'string' ? data.userId : doc.id;
        const openRequest = await adminDb
          .collection('rightsRequests')
          .where('userId', '==', ownerId)
          .where('status', 'in', ['pending', 'processing', 'on_hold'])
          .limit(1)
          .get();

        if (!openRequest.empty) {
          result.skipped += 1;
          continue;
        }

        const key = `${collectionName}/${doc.id}`;

        if (handled.has(key)) continue;

        // Deleting the profile while the Auth account can still sign in leaves
        // a live login with no record behind it, so Auth goes first. If Auth
        // refuses, the profile is kept for the next run.
        if (collectionName === 'users' && !dryRun) {
          try {
            await adminAuth.deleteUser(doc.id);
          } catch (error) {
            const code = (error as { code?: string }).code;

            if (code !== 'auth/user-not-found') {
              result.skipped += 1;
              result.errors.push(
                `users/${doc.id}: could not delete the Auth account (${code ?? 'unknown'})`
              );
              continue;
            }
          }
        }

        handled.add(key);
        result.expired += 1;
        result.details.push({
          collection: collectionName,
          docId: doc.id,
          reason: `${category} retention of ${config.retentionDays} days elapsed`,
        });

        if (dryRun) continue;

        batch.delete(doc.ref);
        queued += 1;
      }

      if (!dryRun && queued > 0) {
        await batch.commit();
        result.deleted += queued;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`${collectionName}: ${message}`);
      logger.error('Retention cleanup failed for collection', {
        collection: collectionName,
        error: message,
      });
    }
  }

  return result;
}

/**
 * Cloud Function / cron entry point.
 *
 * Deletion is opt-in: only `?dryRun=false` actually removes documents.
 */
export async function retentionCleanupHandler(
  request: { query: { dryRun?: string } },
  response: { status: (code: number) => { json: (body: unknown) => void } }
): Promise<void> {
  const dryRun = request.query.dryRun !== 'false';

  try {
    const result = await executeRetentionCleanup(dryRun);

    response.status(200).json({
      success: true,
      dryRun,
      ...result,
    });
  } catch (error) {
    logger.error('Retention cleanup failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    response.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Manual entry point used by operators.
 */
export async function runRetentionCleanupManually(dryRun = true): Promise<RetentionResult> {
  const result = await executeRetentionCleanup(dryRun);
  logger.info('Manual retention cleanup finished', { dryRun, ...result });
  return result;
}
