/**
 * DPDP Act 2023 - Age Verification Operations
 */

import crypto from 'crypto';

import { adminDb } from '@/lib/firebaseAdmin';
import { sendMail } from '@/lib/mailer';
import { logger } from '@/lib/logger';
import { FieldValue } from 'firebase-admin/firestore';
import { calculateAge } from './ageVerification';

/**
 * Verify parental consent for child - DPDP Sec 9
 * In production, this would integrate with a verified parental consent flow
 */
/** How long a parental-consent code stays valid. */
const PARENTAL_OTP_TTL_MS = 10 * 60 * 1000;

/** Wrong codes allowed before the request must be restarted. */
const PARENTAL_OTP_MAX_ATTEMPTS = 5;

/**
 * Salted, deliberately slow hash. A 6-digit code has little entropy, so a fast
 * hash would let anyone with a Firestore dump recover it instantly.
 */
function hashParentalOtp(otp: string, salt: string): string {
  return crypto.scryptSync(otp, salt, 32).toString('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

/** Six digits, drawn from the CSPRNG rather than Math.random. */
function createParentalOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

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
  const otp = params.consentMethod === 'otp' ? createParentalOtp() : null;
  const otpSalt = otp ? crypto.randomBytes(16).toString('hex') : null;

  const consentRef = await adminDb.collection('parentalConsents').add({
    childUid: params.childUid,
    parentEmail: params.parentEmail,
    method: params.consentMethod,
    status: 'pending',
    requestedAt: FieldValue.serverTimestamp(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    ...(otp && otpSalt
      ? {
          otpHash: hashParentalOtp(otp, otpSalt),
          otpSalt,
          otpAttempts: 0,
          otpExpiresAt: new Date(Date.now() + PARENTAL_OTP_TTL_MS),
        }
      : {}),
  });

  // The parent is the account holder for consent purposes, so the code goes to
  // the address they gave, never back to the child's session.
  if (otp) {
    try {
      await sendMail({
        to: params.parentEmail,
        subject: 'ShipIN parental consent code',
        text: `Your ShipIN parental consent code is ${otp}. It expires in 10 minutes.`,
        html: `<p>Your ShipIN parental consent code is <strong>${otp}</strong>.</p><p>It expires in 10 minutes. If you did not request it, ignore this email.</p>`,
      });
    } catch (error) {
      // No code reached the parent, so the pending request is unusable: remove
      // it rather than leaving a record nobody can complete.
      await consentRef.delete();
      logger.error('Could not send parental consent email', {
        consentId: consentRef.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return { success: false, error: 'Could not send the verification email.' };
    }
  }

  // Only OTP is self-service. digital_signature, video_kyc and aadhaar are
  // completed out of band by support, so the pending record is the handoff.

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

  if (!/^\d{6}$/.test(params.otp)) {
    return { success: false, error: 'Invalid OTP format' };
  }

  if (typeof consent.otpHash !== 'string' || typeof consent.otpSalt !== 'string') {
    return {
      success: false,
      error: 'This consent request has no verification code. Request a new one.',
    };
  }

  const attempts = Number(consent.otpAttempts ?? 0);

  if (attempts >= PARENTAL_OTP_MAX_ATTEMPTS) {
    return { success: false, error: 'Too many attempts. Request a new code.' };
  }

  const otpExpiresAt = consent.otpExpiresAt?.toDate?.();
  if (otpExpiresAt instanceof Date && otpExpiresAt.getTime() <= Date.now()) {
    return { success: false, error: 'Verification code expired. Request a new one.' };
  }

  const candidate = hashParentalOtp(params.otp, consent.otpSalt);

  if (!safeEqualHex(candidate, consent.otpHash)) {
    await adminDb
      .collection('parentalConsents')
      .doc(params.consentId)
      .update({ otpAttempts: attempts + 1 });
    return { success: false, error: 'Incorrect OTP.' };
  }

  // Mark as verified
  await adminDb.collection('parentalConsents').doc(params.consentId).update({
    status: 'verified',
    verifiedAt: FieldValue.serverTimestamp(),
    otpHash: FieldValue.delete(),
    otpSalt: FieldValue.delete(),
    otpAttempts: FieldValue.delete(),
    otpExpiresAt: FieldValue.delete(),
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