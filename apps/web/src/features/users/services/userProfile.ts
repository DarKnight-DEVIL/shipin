import { doc, getDoc } from "firebase/firestore";

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

  /** Document schema version for migrations. Default: 1 */
  schemaVersion?: number;
}

export async function getUserProfile(
  userId: string
): Promise<UserProfile | null> {
  const ref = doc(db, "users", userId);

  const snapshot = await getDoc(ref);

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
        displayName: profile.displayName,

        email: profile.email,

        phone: profile.phone ?? "",

        photoURL: profile.photoURL ?? "",
      },
    });
  } catch (error) {
    throw toShipINError(error);
  }
}

/**
 * Repair results, one per account, shared by every caller in this tab.
 *
 * Sign-in flows need the profile to choose a destination, and the platform
 * layout it navigates to repairs the same account again. Without a shared
 * result, every first load after sign-in read `users/{uid}` twice — once on
 * the login page and again as the shell mounted. The promise is cached, not
 * just its value, so a second caller during the first lookup joins it instead
 * of starting another.
 */
const ensuredProfiles = new Map<string, Promise<UserProfile | null>>();

/** Drop the cached repair result, e.g. after the profile is edited. */
export function clearUserProfileCache(uid?: string): void {
  if (uid === undefined) {
    ensuredProfiles.clear();
    return;
  }

  ensuredProfiles.delete(uid);
}

/**
 * Ensure the signed-in account has a profile document, repairing it if absent.
 *
 * Google sign-in (popup or redirect) never passes through registration, so a
 * Google account can authenticate successfully while having no `users/{uid}`
 * document at all. `requireAuthWithProfile` answers 403 USER_PROFILE_NOT_FOUND
 * for such a user, so every authenticated API call fails immediately after a
 * successful sign-in — the dashboard loads but is empty and every action errors.
 *
 * Repair failures are logged, not thrown: the user is already authenticated and
 * navigation must not depend on a write that can be retried from Settings.
 * A failure is not cached, so the next caller retries it.
 */
export async function ensureUserProfile(user: {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
}): Promise<UserProfile | null> {
  const cached = ensuredProfiles.get(user.uid);
  if (cached) return cached;

  const pending = loadOrRepairProfile(user);
  ensuredProfiles.set(user.uid, pending);

  try {
    const profile = await pending;

    // A null result means the repair did not stick; retrying it later is the
    // whole point of the fallback, so nothing is cached.
    if (!profile) ensuredProfiles.delete(user.uid);

    return profile;
  } catch (error) {
    // A rejected read (permissions, offline) must not poison the account for
    // the rest of the tab either.
    ensuredProfiles.delete(user.uid);
    throw error;
  }
}

async function loadOrRepairProfile(user: {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
}): Promise<UserProfile | null> {
  const existing = await getUserProfile(user.uid);
  if (existing) return existing;

  const displayName =
    user.displayName?.trim() || user.email?.split("@")[0] || "ShipIN customer";
  const email = user.email ?? "";
  const photoURL = user.photoURL ?? "";

  try {
    await createUserProfile(user.uid, { displayName, email, photoURL });
  } catch (error) {
    console.error("[profile] Could not create the profile document:", error);
    return null;
  }

  return { displayName, email, phone: "", photoURL };
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

    // The stored document no longer matches the cached repair result.
    clearUserProfileCache(userId);
  } catch (error) {
    throw toShipINError(error);
  }
}
