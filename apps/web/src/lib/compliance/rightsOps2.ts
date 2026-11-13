/**
 * DPDP Act 2023 - Rights Operations (Part 2)
 */

import { adminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { type DataSubjectRight, type RightsRequest, RIGHTS_DEADLINES } from './rights';

/**
 * Record a data subject rights request (DPDP Sec 11-14)
 */
export async function logRightsRequest(params: {
  userId: string;
  right: DataSubjectRight;
  details?: string;
}): Promise<string> {
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + RIGHTS_DEADLINES[params.right]);

  const docRef = await adminDb.collection('rightsRequests').add({
    userId: params.userId,
    right: params.right,
    status: 'pending',
    details: params.details || null,
    responseDeadline: deadline,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return docRef.id;
}

/**
 * Get all rights requests for a user
 */
export async function getUserRightsRequests(userId: string): Promise<RightsRequest[]> {
  const snapshot = await adminDb
    .collection('rightsRequests')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      userId: data.userId as string,
      right: data.right as RightsRequest['right'],
      status: data.status as RightsRequest['status'],
      details: data.details as string | null,
      createdAt: data.createdAt?.toDate?.() || new Date(),
      updatedAt: data.updatedAt?.toDate?.() || new Date(),
      responseDeadline: data.responseDeadline?.toDate?.() || null,
      completedAt: data.completedAt?.toDate?.() || undefined,
    } as RightsRequest;
  });
}

/**
 * Update rights request status
 */
export async function updateRightsRequest(
  requestId: string,
  status: 'pending' | 'processing' | 'completed' | 'rejected' | 'on_hold',
  response?: string,
  assignedTo?: string
): Promise<void> {
  const update: Record<string, unknown> = {
    status,
    updatedAt: FieldValue.serverTimestamp(),
  };
  
  if (response) update.response = response;
  if (status === 'completed') update.completedAt = FieldValue.serverTimestamp();
  if (assignedTo) update.assignedTo = assignedTo;

  await adminDb.collection('rightsRequests').doc(requestId).update(update);
}

/**
 * Get overdue rights requests (for DPO dashboard)
 */
export async function getOverdueRightsRequests(): Promise<RightsRequest[]> {
  const now = new Date();
  const snapshot = await adminDb
    .collection('rightsRequests')
    .where('status', 'in', ['pending', 'processing', 'on_hold'])
    .where('responseDeadline', '<', now)
    .orderBy('responseDeadline')
    .get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      userId: data.userId as string,
      right: data.right as RightsRequest['right'],
      status: data.status as RightsRequest['status'],
      details: data.details as string | null,
      createdAt: data.createdAt?.toDate?.() || new Date(),
      updatedAt: data.updatedAt?.toDate?.() || new Date(),
      responseDeadline: data.responseDeadline?.toDate?.() || null,
      completedAt: data.completedAt?.toDate?.() || undefined,
    } as RightsRequest;
  }) as RightsRequest[];
}

/**
 * Get pending rights requests for a user
 */
export async function getPendingRightsRequests(userId: string): Promise<RightsRequest[]> {
  const snapshot = await adminDb
    .collection('rightsRequests')
    .where('userId', '==', userId)
    .where('status', 'in', ['pending', 'processing', 'on_hold'])
    .orderBy('createdAt', 'desc')
    .get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      userId: data.userId as string,
      right: data.right as RightsRequest['right'],
      status: data.status as RightsRequest['status'],
      details: data.details as string | null,
      createdAt: data.createdAt?.toDate?.() || new Date(),
      updatedAt: data.updatedAt?.toDate?.() || new Date(),
      responseDeadline: data.responseDeadline?.toDate?.() || null,
      completedAt: data.completedAt?.toDate?.() || undefined,
    } as RightsRequest;
  }) as RightsRequest[];
}

/**
 * Assign rights request to DPO/staff
 */
export async function assignRightsRequest(requestId: string, assignedTo: string): Promise<void> {
  await adminDb.collection('rightsRequests').doc(requestId).update({
    assignedTo,
    status: 'processing',
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Escalate overdue request (send alert to DPO)
 */
export async function escalateRightsRequest(requestId: string): Promise<void> {
  const doc = await adminDb.collection('rightsRequests').doc(requestId).get();
  if (!doc.exists) return;

  const request = doc.data()!;
  
  // Log escalation
  await adminDb.collection('rightsEscalations').add({
    requestId,
    userId: request.userId,
    right: request.right,
    originalDeadline: request.responseDeadline,
    escalatedAt: FieldValue.serverTimestamp(),
    escalationLevel: 1,
  });

  console.warn(`RIGHTS REQUEST ESCALATED: ${requestId} for user ${request.userId}`);
}

/**
 * Get all rights requests (for DPO dashboard)
 */
export async function getAllRightsRequests(
  status?: string,
  limit = 100
): Promise<RightsRequest[]> {
  let query = adminDb.collection('rightsRequests').orderBy('createdAt', 'desc');
  
  if (status) {
    query = query.where('status', '==', status);
  }
  
  const snapshot = await query.limit(limit).get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      userId: data.userId as string,
      right: data.right as RightsRequest['right'],
      status: data.status as RightsRequest['status'],
      details: data.details as string | null,
      createdAt: data.createdAt?.toDate?.() || new Date(),
      updatedAt: data.updatedAt?.toDate?.() || new Date(),
      responseDeadline: data.responseDeadline?.toDate?.() || null,
      completedAt: data.completedAt?.toDate?.() || undefined,
    } as RightsRequest;
  }) as RightsRequest[];
}