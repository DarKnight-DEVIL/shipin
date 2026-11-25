#!/usr/bin/env node
/**
 * Break-glass: clear every MFA factor for an admin who cannot pass the gate.
 *
 * The supported reset path is `POST /api/admin/users/[uid]/mfa/reset`, and it
 * requires an admin who has already passed MFA — which is exactly what the person
 * this script is for cannot do. With one admin and one security key there is no
 * supported path back in, so this exists and runs with service-account
 * credentials instead of a session.
 *
 * What that means, stated plainly: **anyone who can read the production
 * service-account key can already read and rewrite every wallet in the project.**
 * This script does not widen that trust boundary, and it is not a second factor
 * you can bypass with a stolen admin token — the token is worthless here. It is a
 * documented door for the person who already holds the keys.
 *
 * What it does, mirroring the API route so the two cannot drift:
 *
 *   Auth      clears `multiFactor.enrolledFactors` (SMS factors live there)
 *   Firestore deletes `mfa.totp`, `mfa.sms`, `mfa.webauthn`; stamps
 *             `mfa.resetAt` / `mfa.resetBy`
 *   Auth      revokes refresh tokens, so a stolen session cannot be refreshed
 *
 * Usage — dry run first, it prints what it would change and writes nothing:
 *
 *   node --env-file=.env.production scripts/break-glass/mfa-reset.ts \
 *     --email admin@example.com --reason "security key lost"
 *
 *   node --env-file=.env.production scripts/break-glass/mfa-reset.ts \
 *     --email admin@example.com --reason "security key lost" --confirm admin@example.com
 *
 * `--confirm` must repeat the address exactly; a typo is then a dry run rather
 * than a silent reset of the wrong account.
 */

import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const MFA_FIELDS = ["mfa.totp", "mfa.sms", "mfa.webauthn"] as const;

export interface TargetState {
  uid: string;
  email: string;
  role: unknown;
  enrolledFactors: number;
  mfaFields: string[];
  otherAdminsWithMfa: number;
}

export interface ResetDeps {
  getUserByEmail(email: string): Promise<{ uid: string; email?: string }>;
  getUser(uid: string): Promise<{ multiFactor?: { enrolledFactors?: unknown[] } }>;
  readUserDoc(uid: string): Promise<Record<string, unknown> | undefined>;
  countOtherAdminsWithMfa(uid: string): Promise<number>;
  clearAuthFactors(uid: string): Promise<void>;
  clearFirestoreFields(uid: string, resetBy: string): Promise<void>;
  revokeRefreshTokens(uid: string): Promise<void>;
  writeAudit(entry: Record<string, unknown>): Promise<void>;
}

export type PlanResult =
  | { ok: false; error: string }
  | { ok: true; state: TargetState };

/**
 * Look before leaping: resolve the account, confirm it is an admin, and report
 * whether anyone else could have done this the supported way.
 */
export async function inspect(
  email: string,
  deps: ResetDeps
): Promise<PlanResult> {
  const trimmed = email.trim();
  if (!trimmed) return { ok: false, error: "An email address is required." };

  let user: { uid: string; email?: string };
  try {
    user = await deps.getUserByEmail(trimmed);
  } catch {
    return { ok: false, error: `No account for ${trimmed}.` };
  }

  const doc = (await deps.readUserDoc(user.uid)) ?? {};
  if (doc.role !== "admin") {
    // Deliberately refuses customers: support already has an audited path for
    // them, and a script that can reset anyone's MFA is a bigger door than this
    // problem needs.
    return {
      ok: false,
      error: `${trimmed} is not an admin (role: ${String(doc.role)}). Use the admin reset API for customer accounts.`,
    };
  }

  const authUser = await deps.getUser(user.uid);
  const mfa = (doc.mfa ?? {}) as Record<string, unknown>;

  return {
    ok: true,
    state: {
      uid: user.uid,
      email: user.email ?? trimmed,
      role: doc.role,
      enrolledFactors: authUser.multiFactor?.enrolledFactors?.length ?? 0,
      mfaFields: MFA_FIELDS.filter((field) => {
        const [, key] = field.split(".");
        return mfa[key] !== undefined;
      }),
      otherAdminsWithMfa: await deps.countOtherAdminsWithMfa(user.uid),
    },
  };
}

/**
 * Apply the reset. `confirm` must equal the account's email, which is the only
 * thing standing between a typo and the wrong admin losing their factors.
 */
export async function applyReset(
  email: string,
  confirm: string | undefined,
  reason: string,
  deps: ResetDeps
): Promise<{ ok: boolean; message: string; state?: TargetState }> {
  const inspected = await inspect(email, deps);
  if (!inspected.ok) return { ok: false, message: inspected.error };

  const { state } = inspected;

  if (!confirm) {
    return {
      ok: false,
      message: "Dry run: pass --confirm <email> to actually clear the factors.",
      state,
    };
  }

  if (confirm.trim().toLowerCase() !== state.email.toLowerCase()) {
    return {
      ok: false,
      message: `--confirm does not match ${state.email}; nothing was changed.`,
      state,
    };
  }

  if (!reason.trim()) {
    return { ok: false, message: "A --reason is required so the audit entry says why.", state };
  }

  await deps.clearAuthFactors(state.uid);
  await deps.clearFirestoreFields(state.uid, "break-glass");
  await deps.revokeRefreshTokens(state.uid);
  await deps.writeAudit({
    actorUid: "break-glass-script",
    actorEmail: null,
    action: "mfa.break_glass_reset",
    targetType: "user",
    targetId: state.uid,
    reason: reason.trim(),
  });

  return {
    ok: true,
    message: `Cleared ${state.enrolledFactors} Auth factor(s) and ${state.mfaFields.length} Firestore factor(s) for ${state.email}.`,
    state,
  };
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                        */
/* -------------------------------------------------------------------------- */

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function adminApp(): App {
  if (getApps().length > 0) return getApps()[0];

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !rawKey) {
    throw new Error(
      "FIREBASE_ADMIN_PROJECT_ID / _CLIENT_EMAIL / _PRIVATE_KEY are required. Point this at the deployment whose admin is locked out."
    );
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: rawKey.replace(/\\n/g, "\n"),
    }),
  });
}

async function main() {
  const email = arg("email");
  const reason = arg("reason") ?? "";
  const confirm = arg("confirm");

  if (!email) {
    console.error(
      "Usage: mfa-reset.ts --email <address> --reason <why> [--confirm <address>]"
    );
    process.exit(1);
  }

  const app = adminApp();
  const auth = getAuth(app);
  const db = getFirestore(app);

  const deps: ResetDeps = {
    getUserByEmail: (address) => auth.getUserByEmail(address),
    getUser: (uid) => auth.getUser(uid),
    readUserDoc: async (uid) => (await db.collection("users").doc(uid).get()).data(),
    countOtherAdminsWithMfa: async (uid) => {
      const admins = await db.collection("users").where("role", "==", "admin").get();

      return admins.docs.filter(
        (doc) => doc.id !== uid && doc.data().mfa && Object.keys(doc.data().mfa).length > 0
      ).length;
    },
    clearAuthFactors: async (uid) => {
      await auth.updateUser(uid, { multiFactor: { enrolledFactors: [] } });
    },
    clearFirestoreFields: async (uid, resetBy) => {
      const update: Record<string, unknown> = {
        "mfa.resetAt": FieldValue.serverTimestamp(),
        "mfa.resetBy": resetBy,
      };

      for (const field of MFA_FIELDS) update[field] = FieldValue.delete();

      await db.collection("users").doc(uid).update(update);
    },
    revokeRefreshTokens: (uid) => auth.revokeRefreshTokens(uid),
    writeAudit: async (entry) => {
      await db.collection("adminAuditLog").add({
        ...entry,
        createdAt: FieldValue.serverTimestamp(),
      });
    },
  };

  const result = await applyReset(email, confirm, reason, deps);

  if (result.state) {
    console.log(
      [
        `account:            ${result.state.email} (${result.state.uid})`,
        `role:               ${String(result.state.role)}`,
        `Auth factors:       ${result.state.enrolledFactors}`,
        `Firestore factors:  ${result.state.mfaFields.join(", ") || "none"}`,
        `other admins with MFA: ${result.state.otherAdminsWithMfa}`,
      ].join("\n")
    );

    if (result.state.otherAdminsWithMfa > 0) {
      console.warn(
        "\nAnother admin can still authenticate, so the supported reset API was also available.\nUsing it would have kept this in the audited admin log; this script is for when nobody can."
      );
    }
  }

  if (!result.ok) {
    console.error(`\n${result.message}`);
    process.exit(confirm ? 1 : 0);
  }

  console.log(`\n${result.message}`);
  console.log(
    "\nThe account can sign in now and must enrol a new factor at the next MFA prompt.\nExisting ID tokens stay valid for up to an hour; refresh tokens are revoked."
  );
}

// Only run when invoked directly, so the exports above stay unit-testable.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("break-glass/mfa-reset.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
