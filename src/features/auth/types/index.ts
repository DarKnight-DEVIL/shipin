import type { UserProfile } from "@/features/users/services/userProfile";

export type { UserProfile };

export interface LoginIntent {
  provider: 'google';
}

export interface LoginIntentResponse {
  success: boolean;
  message?: string;
}

export interface MFAToken {
  uid: string;
  mfaRequired: boolean;
  mfaSetupRequired: boolean;
  availableMethods: ('totp' | 'webauthn' | 'sms')[];
}