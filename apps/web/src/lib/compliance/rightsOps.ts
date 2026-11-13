/**
 * DPDP Act 2023 - Rights Request Operations (Core)
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
 * Get rights request by ID
 */
export async function getRightsRequest(requestId: string): Promise<RightsRequest | null> {
  const doc = await adminDb.collection('rightsRequests').doc(requestId).get();
  if (!doc.exists) return null;
  
  const data = doc.data()!;
  return {
    id: doc.id,
    ...data,
    createdAt: data.createdAt?.toDate?.() || new Date(),
    updatedAt: data.updatedAt?.toDate?.() || new Date(),
    responseDeadline: data.responseDeadline?.toDate?.() || null,
    completedAt: data.completedAt?.toDate?.() || undefined,
  } as RightsRequest;
}