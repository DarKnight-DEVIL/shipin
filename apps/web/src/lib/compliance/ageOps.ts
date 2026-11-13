/**
 * DPDP Act 2023 - Age Verification Operations
 */

import { adminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { calculateAge } from './ageVerification';

/**
 * Verify parental consent for child - DPDP Sec 9
 * In production, this would integrate with a verified parental consent flow
 */
export async function verifyParentalConsent(params: {
  childUid: string;
  parentEmail: string;
  consentMethod: 'otp' | 'digital_signature' | 'video_kyc' | 'aadhaar';
}): Promise<{ success: boolean; consentId?: string; error?: string }> {
  // Check if child already has verified parental consent
  const childDoc = await adminDb.collection('users').doc(params.childUid).get();
  if (childDoc.exists) {
    const childData = childDoc.data()!;
    if (childData.parentalConsentVerified === true) {
      return { success: true, consentId: childData.parentalConsentId };
    }
  }

  // Create consent request record
  const consentRef = await adminDb.collection('parentalConsents').add({
    childUid: params.childUid,
    parentEmail: params.parentEmail,
    method: params.consentMethod,
    status: 'pending',
    requestedAt: FieldValue.serverTimestamp(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  });

  // In production: send OTP/link to parentEmail based on method
  // For OTP: send 6-digit code to parentEmail
  // For digital_signature: send DocuSign/Adobe Sign link
  // For video_kyc: schedule video call
  // For aadhaar: redirect to Aadhaar e-KYC

  return { 
    success: true, 
    consentId: consentRef.id,
    error: 'Parental consent required. Please complete verification.' 
  };
}

/**
 * Verify parental consent OTP/code
 */
export async function verifyParentalConsentOTP(params: {
  consentId: string;
  otp: string;
}): Promise<{ success: boolean; error?: string }> {
  const consentDoc = await adminDb.collection('parentalConsents').doc(params.consentId).get();
  
  if (!consentDoc.exists) {
    return { success: false, error: 'Invalid consent request' };
  }

  const consent = consentDoc.data()!;
  
  if (consent.status !== 'pending') {
    return { success: false, error: 'Consent request already processed' };
  }

  if (consent.expiresAt && consent.expiresAt.toDate() < new Date()) {
    return { success: false, error: 'Consent request expired' };
  }

  // In production: verify OTP against stored hash
  // For now, accept any 6-digit OTP
  if (!/^\d{6}$/.test(params.otp)) {
    return { success: false, error: 'Invalid OTP format' };
  }

  // Mark as verified
  await adminDb.collection('parentalConsents').doc(params.consentId).update({
    status: 'verified',
    verifiedAt: FieldValue.serverTimestamp(),
  });

  // Update child's user record
  const consentData = (await adminDb.collection('parentalConsents').doc(params.consentId).get()).data()!;
  await adminDb.collection('users').doc(consentData.childUid).update({
    parentalConsentVerified: true,
    parentalConsentId: params.consentId,
    parentalConsentVerifiedAt: FieldValue.serverTimestamp(),
    parentalConsentMethod: 'otp',
  });

  return { success: true };
}

/**
 * Check if user has verified parental consent
 */
export async function hasParentalConsent(userId: string): Promise<boolean> {
  const userDoc = await adminDb.collection('users').doc(userId).get();
  if (!userDoc.exists) return false;
  
  const data = userDoc.data()!;
  return data.parentalConsentVerified === true;
}

/**
 * Get user's age from profile
 */
export async function getUserAge(userId: string): Promise<number | null> {
  const userDoc = await adminDb.collection('users').doc(userId).get();
  if (!userDoc.exists) return null;
  
  const data = userDoc.data()!;
  if (!data.dateOfBirth) return null;
  
  return calculateAge(data.dateOfBirth);
}

/**
 * Age gate middleware - reject requests from unverified children
 */
export async function enforceAgeGate(userId: string): Promise<{ allowed: boolean; error?: string }> {
  const userDoc = await adminDb.collection('users').doc(userId).get();
  if (!userDoc.exists) return { allowed: false, error: 'User not found' };

  const data = userDoc.data()!;
  
  // If no DOB, allow but log warning
  if (!data.dateOfBirth) {
    return { allowed: true };
  }

  const age = calculateAge(data.dateOfBirth);
  
  if (age < 18) {
    const hasConsent = await hasParentalConsent(userId);
    if (!hasConsent) {
      return {
        allowed: false,
        error: 'Users under 18 require verified parental consent per DPDP Act 2023',
      };
    }
  }

  return { allowed: true };
}