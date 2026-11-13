/**
 * DPDP Act 2023 - Consent Management & Logging
 * 
 * Consent logging, granular consent management, and audit trail
 */

import { adminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { PERSONAL_DATA_CATEGORIES } from './dpdp';

export interface ConsentLogEntry {
  userId: string;
  category: typeof PERSONAL_DATA_CATEGORIES[keyof typeof PERSONAL_DATA_CATEGORIES];
  granted: boolean;
  version: string;
  method: 'explicit' | 'implied' | 'withdrawn';
  ip?: string;
  userAgent?: string;
  timestamp: Date;
}

export interface ConsentState {
  [category: string]: {
    granted: boolean;
    version: string;
    updatedAt: Date;
    method: 'explicit' | 'implied' | 'withdrawn';
  };
}

/**
 * Log a consent decision for audit trail (DPDP Sec 6-7)
 */
export async function logConsent(params: {
  userId: string;
  category: string;
  granted: boolean;
  version: string;
  ip?: string;
  userAgent?: string;
  method: 'explicit' | 'implied' | 'withdrawn';
}): Promise<void> {
  await adminDb.collection('consentLogs').add({
    userId: params.userId,
    category: params.category,
    granted: params.granted,
    version: params.version,
    method: params.method,
    ip: params.ip || null,
    userAgent: params.userAgent || null,
    timestamp: FieldValue.serverTimestamp(),
  });
}

/**
 * Get current consent state for a user
 */
export async function getUserConsentState(userId: string): Promise<ConsentState> {
  const snapshot = await adminDb
    .collection('consentLogs')
    .where('userId', '==', userId)
    .orderBy('timestamp', 'desc')
    .get();

  const state: ConsentState = {} as ConsentState;
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const category = data.category;
    
    // Only keep the latest entry for each category
    if (!state[category]) {
      state[category] = {
        granted: data.granted,
        version: data.version,
        updatedAt: data.timestamp?.toDate?.() || new Date(),
        method: data.method,
      };
    }
  }

  return state;
}

/**
 * Update user consent for a specific category
 */
export async function updateUserConsent(params: {
  userId: string;
  category: string;
  granted: boolean;
  version: string;
  method: 'explicit' | 'withdrawn';
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  // Log the consent change
  await adminDb.collection('consentLogs').add({
    userId: params.userId,
    category: params.category,
    granted: params.granted,
    version: params.version,
    method: params.method,
    ip: params.ip || null,
    userAgent: params.userAgent || null,
    timestamp: FieldValue.serverTimestamp(),
  });

  // Update user's consent state document for quick lookup
  await adminDb.collection('userConsents').doc(params.userId).set({
    [`${params.category}`]: {
      granted: params.granted,
      version: params.version,
      method: params.method,
      updatedAt: FieldValue.serverTimestamp(),
    },
  }, { merge: true });
}

/**
 * Get consent log for a user (for audit/export)
 */
export async function getConsentLog(userId: string, limit = 100): Promise<ConsentLogEntry[]> {
  const snapshot = await adminDb
    .collection('consentLogs')
    .where('userId', '==', userId)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      userId: data.userId as string,
      category: data.category as string,
      granted: Boolean(data.granted),
      version: data.version as string,
      method: (data.method as ConsentLogEntry['method']) || 'explicit',
      timestamp: (data.timestamp as Date) || null,
      ip: (data.ip as string) || undefined,
      userAgent: (data.userAgent as string) || undefined,
    } as ConsentLogEntry;
  });
}

/**
 * Check if user has valid consent for a category
 */
export async function hasValidConsent(
  userId: string,
  category: string,
  requiredVersion?: string
): Promise<boolean> {
  const state = await getUserConsentState(userId);
  const consent = state[category];
  
  if (!consent || !consent.granted) return false;
  if (requiredVersion && consent.version !== requiredVersion) return false;
  
  return true;
}

/**
 * Get all categories where user has granted consent
 */
export async function getGrantedCategories(userId: string): Promise<string[]> {
  const state = await getUserConsentState(userId);
  return Object.entries(state)
    .filter(([, v]) => v.granted)
    .map(([k]) => k);
}

/**
 * Withdraw consent for a category (right to withdraw - DPDP Sec 6)
 */
export async function withdrawConsent(
  userId: string,
  category: string,
  version: string,
  ip?: string,
  userAgent?: string
): Promise<void> {
  await logConsent({
    userId,
    category,
    granted: false,
    version,
    method: 'withdrawn',
    ip,
    userAgent,
  });
}