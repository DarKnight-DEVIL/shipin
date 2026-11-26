/**
 * Safe, client-facing projection of `users/{uid}`.
 *
 * The profile document also carries server-owned fields. Today the sensitive
 * ones are the legacy MFA secret fields during a migration; the projection is
 * also the single place that decides what a browser may see, so a future field
 * is not exposed just by being written to the document.
 */

export interface UserProfile {
  displayName: string;
  email: string;
  phone: string;
  photoURL?: string;
  role?: "admin" | "customer";
  mfa?: {
    totp?: { enabled?: boolean };
    sms?: { enabled?: boolean; phoneNumber?: string };
    required?: boolean;
  };
  createdAt?: unknown;
  updatedAt?: unknown;
  /** ISO date (YYYY-MM-DD). Drives the DPDP age gate. */
  dateOfBirth?: string;
  /** Document schema version for migrations. Default: 1 */
  schemaVersion?: number;
}

export function projectUserProfile(
  data: Record<string, unknown>
): UserProfile {
  const mfa =
    data.mfa && typeof data.mfa === "object"
      ? (data.mfa as Record<string, unknown>)
      : undefined;
  const totp =
    mfa?.totp && typeof mfa.totp === "object"
      ? (mfa.totp as Record<string, unknown>)
      : undefined;
  const sms =
    mfa?.sms && typeof mfa.sms === "object"
      ? (mfa.sms as Record<string, unknown>)
      : undefined;

  return {
    displayName: typeof data.displayName === "string" ? data.displayName : "",
    email: typeof data.email === "string" ? data.email : "",
    phone: typeof data.phone === "string" ? data.phone : "",
    ...(typeof data.photoURL === "string" ? { photoURL: data.photoURL } : {}),
    ...(data.role === "admin" || data.role === "customer"
      ? { role: data.role }
      : {}),
    ...(mfa
      ? {
          mfa: {
            totp: { enabled: totp?.enabled === true },
            sms: {
              enabled: sms?.enabled === true,
              ...(typeof sms?.phoneNumber === "string"
                ? { phoneNumber: sms.phoneNumber }
                : {}),
            },
            required: mfa.required === true,
          },
        }
      : {}),
    ...(data.createdAt !== undefined ? { createdAt: data.createdAt } : {}),
    ...(data.updatedAt !== undefined ? { updatedAt: data.updatedAt } : {}),
    ...(typeof data.dateOfBirth === "string"
      ? { dateOfBirth: data.dateOfBirth }
      : {}),
    ...(typeof data.schemaVersion === "number"
      ? { schemaVersion: data.schemaVersion }
      : {}),
  };
}
