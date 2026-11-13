import {
  doc,
  getDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebaseDb";
import { customerApi } from "@/lib/customerApiClient";
import { toShipINError } from "@/utils/errors";

export interface UserProfile {
  displayName: string;

  email: string;

  phone: string;

  photoURL?: string;

  /**
   * Administrator role.
   *
   * Normal customers do not need this field.
   */
  role?: "admin" | "customer";

  /**
   * Multi-factor authentication configuration.
   * Only applicable for admin users.
   */
  mfa?: {
    /**
     * TOTP configuration
     */
    totp?: {
      /** Base32-encoded secret for TOTP generation */
      secret: string;
      /** Whether TOTP is enabled and verified */
      enabled: boolean;
      /** Backup codes (SHA-256 hashed) */
      backupCodes?: string[];
      /** Last used backup code index (for tracking) */
      lastBackupCodeIndex?: number;
    };

    /**
     * WebAuthn/Passkey credentials
     */
    webauthn?: {
      /** Array of registered credential IDs (base64url encoded) */
      credentialIds: string[];
      /** Human-readable names for each credential */
      credentialNames: string[];
      /** Whether WebAuthn is enabled */
      enabled: boolean;
    };

    /**
     * SMS-based MFA
     */
    sms?: {
      /** Phone number in E.164 format (e.g., +15551234567) */
      phoneNumber: string;
      /** Whether SMS MFA is enabled and verified */
      enabled: boolean;
    };

    /**
     * MFA enforcement policy
     */
    required?: boolean;
  };

  createdAt?: unknown;

  updatedAt?: unknown;
}

export async function getUserProfile(
  userId: string
): Promise<UserProfile | null> {
  const ref = doc(
    db,
    "users",
    userId
  );

  const snapshot =
    await getDoc(ref);

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data() as UserProfile;
}

export async function createUserProfile(
  userId: string,
  profile: {
    displayName: string;

    email: string;

    phone?: string;

    photoURL?: string;
  }
) {
  try {
    void userId;

    await customerApi<{ success: boolean }>("/api/profile", {
      method: "POST",
      body: {
        displayName:
          profile.displayName,

        email:
          profile.email,

        phone:
          profile.phone ?? "",

        photoURL:
          profile.photoURL ?? "",
      },
    });
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function updateUserProfile(
  userId: string,
  updates: {
    displayName?: string;

    email?: string;

    phone?: string;

    photoURL?: string;
  }
) {
  try {
    void userId;

    await customerApi<{ success: boolean }>("/api/profile", {
      method: "PATCH",
      body: updates,
    });
  } catch (error) {
    throw toShipINError(error);
  }
}
