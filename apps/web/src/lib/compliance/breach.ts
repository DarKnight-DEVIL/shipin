/**
 * DPDP Act 2023 - Data Breach Notification (Sec 9)
 * 
 * 72-hour breach notification to Data Protection Board and affected users
 */

import { adminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { PERSONAL_DATA_CATEGORIES } from './dpdp';

export interface BreachRecord {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedCategories: typeof PERSONAL_DATA_CATEGORIES[keyof typeof PERSONAL_DATA_CATEGORIES][];
  estimatedAffectedUsers: number;
  discoveredAt: Date;
  containedAt?: Date;
  rootCause?: string;
  remediationSteps?: string[];
  reportedToBoard: boolean;
  reportedToUsers: boolean;
  status: 'open' | 'contained' | 'resolved' | 'closed';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Record a personal data breach (DPDP Sec 9 - 72 hours to Board)
 */
export async function recordBreach(params: {
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedCategories: string[];
  estimatedAffectedUsers: number;
  discoveredAt: Date;
  containedAt?: Date;
  rootCause?: string;
  remediationSteps?: string[];
  reportedToBoard: boolean;
  reportedToUsers: boolean;
}): Promise<string> {
  const docRef = await adminDb.collection('dataBreaches').add({
    severity: params.severity,
    description: params.description,
    affectedCategories: params.affectedCategories,
    estimatedAffectedUsers: params.estimatedAffectedUsers,
    discoveredAt: params.discoveredAt,
    containedAt: params.containedAt || null,
    rootCause: params.rootCause || null,
    remediationSteps: params.remediationSteps || [],
    reportedToBoard: params.reportedToBoard,
    reportedToUsers: params.reportedToUsers,
    status: 'open',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Auto-escalate critical breaches
  if (params.severity === 'critical') {
    console.error('CRITICAL BREACH RECORDED:', docRef.id, params);
  }

  return docRef.id;
}

/**
 * Update breach record
 */
export async function updateBreach(
  breachId: string,
  updates: Partial<{
    containedAt: Date;
    rootCause: string;
    remediationSteps: string[];
    reportedToBoard: boolean;
    reportedToUsers: boolean;
    status: 'open' | 'contained' | 'resolved' | 'closed';
  }>
): Promise<void> {
  const updateData: Record<string, unknown> = {
    ...updates,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await adminDb.collection('dataBreaches').doc(breachId).update(updateData);
}

/**
 * Get breach by ID
 */
export async function getBreach(breachId: string): Promise<BreachRecord | null> {
  const doc = await adminDb.collection('dataBreaches').doc(breachId).get();
  if (!doc.exists) return null;
  
  const data = doc.data()!;
  return {
    id: doc.id,
    severity: data.severity as BreachRecord['severity'],
    description: data.description as string,
    affectedCategories: (data.affectedCategories as string[]) || [],
    estimatedAffectedUsers: Number(data.estimatedAffectedUsers) || 0,
    discoveredAt: data.discoveredAt?.toDate?.() || new Date(),
    containedAt: (data.containedAt as Date) || null,
    rootCause: (data.rootCause as string) || null,
    remediationSteps: (data.remediationSteps as string[]) || [],
    reportedToBoard: Boolean(data.reportedToBoard),
    reportedToUsers: Boolean(data.reportedToUsers),
    status: data.status as BreachRecord['status'],
    createdAt: data.createdAt?.toDate?.() || new Date(),
    updatedAt: data.updatedAt?.toDate?.() || new Date(),
  } as BreachRecord;
}

/**
 * Get all breaches (for DPO dashboard)
 */
export async function getAllBreaches(
  status?: string,
  limit = 100
): Promise<BreachRecord[]> {
  let query = adminDb.collection('dataBreaches').orderBy('createdAt', 'desc');
  
  if (status) {
    query = query.where('status', '==', status);
  }
  
  const snapshot = await query.limit(limit).get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      severity: data.severity as BreachRecord['severity'],
      description: data.description as string,
      affectedCategories: (data.affectedCategories as string[]) || [],
      estimatedAffectedUsers: Number(data.estimatedAffectedUsers) || 0,
      discoveredAt: data.discoveredAt?.toDate?.() || new Date(),
      containedAt: (data.containedAt as Date) || null,
      rootCause: (data.rootCause as string) || null,
      remediationSteps: (data.remediationSteps as string[]) || [],
      reportedToBoard: Boolean(data.reportedToBoard),
      reportedToUsers: Boolean(data.reportedToUsers),
      status: data.status as BreachRecord['status'],
      createdAt: data.createdAt?.toDate?.() || new Date(),
      updatedAt: data.updatedAt?.toDate?.() || new Date(),
    } as BreachRecord;
  }) as BreachRecord[];
}

/**
 * Get open/critical breaches (for DPO alerting)
 */
export async function getActiveBreaches(): Promise<BreachRecord[]> {
  const snapshot = await adminDb
    .collection('dataBreaches')
    .where('status', 'in', ['open', 'contained'])
    .orderBy('createdAt', 'desc')
    .get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      severity: data.severity as BreachRecord['severity'],
      description: data.description as string,
      affectedCategories: (data.affectedCategories as string[]) || [],
      estimatedAffectedUsers: Number(data.estimatedAffectedUsers) || 0,
      discoveredAt: data.discoveredAt?.toDate?.() || new Date(),
      containedAt: (data.containedAt as Date) || null,
      rootCause: (data.rootCause as string) || null,
      remediationSteps: (data.remediationSteps as string[]) || [],
      reportedToBoard: Boolean(data.reportedToBoard),
      reportedToUsers: Boolean(data.reportedToUsers),
      status: data.status as BreachRecord['status'],
      createdAt: data.createdAt?.toDate?.() || new Date(),
      updatedAt: data.updatedAt?.toDate?.() || new Date(),
    } as BreachRecord;
  }) as BreachRecord[];
}