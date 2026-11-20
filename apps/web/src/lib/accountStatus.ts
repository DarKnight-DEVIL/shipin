/**
 * Account-state gate shared by the customer and administrator auth layers.
 *
 * `firestore.rules` already stops a user from writing these fields on their own
 * profile, so they can only be set by an administrator (Admin SDK / console).
 * Reading them here is what makes such a write take effect on the next request
 * instead of whenever the current ID token happens to expire.
 *
 * A field counts as "set" for any value that is not `false`, `null` or
 * `undefined`: an admin may store a boolean, a timestamp (`deletedAt`), or a
 * reason string, and all three mean the account is no longer allowed in.
 */

export type BlockedAccountStatus =
  "disabled" | "suspended" | "banned" | "deleted";

export type AccountBlock = {
  status: BlockedAccountStatus;
  code: string;
  message: string;
};

const BLOCKED: Record<BlockedAccountStatus, Omit<AccountBlock, "status">> = {
  deleted: {
    code: "ACCOUNT_DELETED",
    message: "This account has been deleted.",
  },
  banned: {
    code: "ACCOUNT_BANNED",
    message: "This account has been banned.",
  },
  suspended: {
    code: "ACCOUNT_SUSPENDED",
    message: "This account is suspended.",
  },
  disabled: {
    code: "ACCOUNT_DISABLED",
    message: "This account is disabled.",
  },
};

function isSet(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return false;
  if (typeof value === "string")
    return value.trim() !== "" && value.trim() !== "false";
  return true;
}

/**
 * Returns the block that applies to a profile document, or `null` when the
 * account may sign in.
 *
 * Deletion outranks a ban, which outranks a suspension, which outranks a
 * disable — the most consequential reason is the one reported.
 */
export function getAccountBlock(
  profile: Record<string, unknown> | null | undefined
): AccountBlock | null {
  if (!profile) return null;

  if (isSet(profile.deletedAt))
    return { status: "deleted", ...BLOCKED.deleted };
  // Requested deletion and anonymisation are the two states the retention sweep
  // treats as closed. Blocking them here means a profile awaiting cleanup — or
  // one whose Auth deletion failed — cannot be used in the meantime.
  if (isSet(profile.deletionRequestedAt))
    return { status: "deleted", ...BLOCKED.deleted };
  if (isSet(profile.anonymizedAt))
    return { status: "deleted", ...BLOCKED.deleted };
  if (isSet(profile.banned)) return { status: "banned", ...BLOCKED.banned };
  if (isSet(profile.suspended))
    return { status: "suspended", ...BLOCKED.suspended };
  if (isSet(profile.disabled))
    return { status: "disabled", ...BLOCKED.disabled };

  return null;
}
