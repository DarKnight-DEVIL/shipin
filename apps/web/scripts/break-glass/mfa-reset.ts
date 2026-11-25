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
import { generateSecret, verifySync } from "otplib";

import { hashBackupCode } from "../../src/lib/mfaBackupCodes";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

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
/* Authenticator (TOTP) enrolment                                             */
/* -------------------------------------------------------------------------- */

/**
 * The app's own enrolment screen is the normal way to add an authenticator, and
 * when it works it is better than this: it shows a QR and confirms a code before
 * anything is enabled. It is here for the case where it does not work — a code
 * that is refused on every attempt leaves the account with no factor at all,
 * which is exactly the state the gate calls "not configured" and refuses to
 * move past.
 *
 * Two steps, so a wrong secret never becomes an active factor:
 *
 *   --enrol-totp            writes a pending secret (enabled: false) and saves
 *                           the otpauth:// URL to a local file
 *   --enrol-totp --code NNNNNN
 *                           verifies the code against that secret, then enables
 *                           it and issues backup codes
 *
 * The secret is written to a file rather than printed, so it does not end up in
 * a shell history or a transcript. Nothing is enabled without a code that the
 * script itself verified.
 */

export interface EnrolTarget {
  uid: string;
  email: string;
  pendingSecret: string | null;
  enabled: boolean;
  backupCodes: number;
}

export interface EnrolDeps {
  getUserByEmail(email: string): Promise<{ uid: string; email?: string }>;
  readUserDoc(uid: string): Promise<Record<string, unknown> | undefined>;
  writePendingSecret(uid: string, secret: string): Promise<void>;
  enableTotp(
    uid: string,
    secret: string,
    backupCodes: string[]
  ): Promise<void>;
  writeAudit(entry: Record<string, unknown>): Promise<void>;
  generateSecret(): string;
  verifyCode(secret: string, code: string): boolean;
  generateBackupCodes(count: number): string[];
  /** Must match the app's scrypt hashing, or stored codes can never verify. */
  hashBackupCode(code: string): string;
}

export type EnrolResolution =
  | { ok: false; error: string }
  | { ok: true; target: EnrolTarget };

export async function resolveEnrolTarget(
  email: string,
  deps: EnrolDeps
): Promise<EnrolResolution> {
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
    return { ok: false, error: `${trimmed} is not an admin.` };
  }

  const totp = ((doc.mfa ?? {}) as { totp?: Record<string, unknown> }).totp;

  return {
    ok: true,
    target: {
      uid: user.uid,
      email: user.email ?? trimmed,
      pendingSecret:
        typeof totp?.secret === "string" && totp.enabled !== true
          ? totp.secret
          : null,
      enabled: totp?.enabled === true,
      backupCodes: Array.isArray(totp?.backupCodes) ? totp.backupCodes.length : 0,
    },
  };
}

/** RFC 6238 discovery URL; the same parameters the app's QR encodes. */
export function buildOtpauthUrl(secret: string, account: string): string {
  const label = encodeURIComponent(`ShipIN Admin:${account}`);
  const query = new URLSearchParams({
    secret,
    issuer: "ShipIN Admin",
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });

  return `otpauth://totp/${label}?${query.toString()}`;
}

/**
 * Step one: mint a secret and store it as pending. An already-enabled factor is
 * never silently replaced — that would lock out the very person this helps.
 */
export async function stageTotpEnrolment(
  email: string,
  deps: EnrolDeps
): Promise<{
  ok: boolean;
  message: string;
  secret?: string;
  otpauthUrl?: string;
}> {
  const resolved = await resolveEnrolTarget(email, deps);
  if (!resolved.ok) return { ok: false, message: resolved.error };

  if (resolved.target.enabled) {
    return {
      ok: false,
      message:
        `${resolved.target.email} already has an enabled authenticator. Run this without ` +
        "--code only after a reset (which removes it), or use the app's own replacement flow.",
    };
  }

  const secret = deps.generateSecret();
  await deps.writePendingSecret(resolved.target.uid, secret);
  await deps.writeAudit({
    actorUid: "break-glass-script",
    actorEmail: null,
    action: "mfa.break_glass_enrol_staged",
    targetType: "user",
    targetId: resolved.target.uid,
  });

  return {
    ok: true,
    message: "Pending secret written. Add it to your authenticator app, then confirm with --code.",
    secret,
    otpauthUrl: buildOtpauthUrl(secret, resolved.target.email),
  };
}

/**
 * Step two: verify the code, then (and only then) enable the factor and issue
 * backup codes. A pending secret left unconfirmed stays disabled, exactly like
 * an abandoned enrolment in the UI.
 */
export async function confirmTotpEnrolment(
  email: string,
  code: string | undefined,
  deps: EnrolDeps
): Promise<{ ok: boolean; message: string; backupCodes?: string[] }> {
  const resolved = await resolveEnrolTarget(email, deps);
  if (!resolved.ok) return { ok: false, message: resolved.error };

  const { target } = resolved;

  if (!target.pendingSecret) {
    return {
      ok: false,
      message: "No pending authenticator secret. Run --enrol-totp first to get one.",
    };
  }

  const trimmed = (code ?? "").trim();
  if (!/^\d{6}$/.test(trimmed)) {
    return { ok: false, message: "--code must be the 6 digits the app is showing." };
  }

  if (!deps.verifyCode(target.pendingSecret, trimmed)) {
    return {
      ok: false,
      message:
        "That code does not match the pending secret. If your app shows a different entry, " +
        "scan the saved otpauth:// URL again; if the digits match but fail, the phone clock is off.",
    };
  }

  const backupCodes = deps.generateBackupCodes(10);

  // The app stores backup codes as scrypt hashes, never plaintext: matching that
  // is not optional, because a plaintext entry can never verify. The plaintext
  // is returned once, for the file the operator reads.
  await deps.enableTotp(
    target.uid,
    target.pendingSecret,
    backupCodes.map(deps.hashBackupCode)
  );
  await deps.writeAudit({
    actorUid: "break-glass-script",
    actorEmail: null,
    action: "mfa.break_glass_enrol_confirmed",
    targetType: "user",
    targetId: target.uid,
  });

  return {
    ok: true,
    message: `Authenticator enabled for ${target.email}.`,
    backupCodes,
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
  const enrol = process.argv.includes("--enrol-totp");
  const code = arg("code");

  if (!email) {
    console.error(
      [
        "Usage:",
        "  mfa-reset.ts --email <address> --reason <why> [--confirm <address>]",
        "  mfa-reset.ts --email <address> --enrol-totp",
        "  mfa-reset.ts --email <address> --enrol-totp --code <6 digits>",
      ].join("\n")
    );
    process.exit(1);
  }

  const app = adminApp();
  const auth = getAuth(app);
  const db = getFirestore(app);

  if (enrol) {
    const enrolDeps: EnrolDeps = {
      getUserByEmail: (address) => auth.getUserByEmail(address),
      readUserDoc: async (uid) =>
        (await db.collection("users").doc(uid).get()).data(),
      writePendingSecret: async (uid, secret) => {
        await db.collection("users").doc(uid).update({
          "mfa.totp": { secret, enabled: false, backupCodes: [] },
          "mfa.required": true,
          "mfa.enrolStagedAt": FieldValue.serverTimestamp(),
        });
      },
      enableTotp: async (uid, secret, backupCodes) => {
        await db.collection("users").doc(uid).update({
          "mfa.totp": { secret, enabled: true, backupCodes },
          "mfa.enrolledAt": FieldValue.serverTimestamp(),
          "mfa.enrolledBy": "break-glass",
        });
      },
      writeAudit: async (entry) => {
        await db.collection("adminAuditLog").add({
          ...entry,
          createdAt: FieldValue.serverTimestamp(),
        });
      },
      generateSecret: () => generateSecret(),
      verifyCode: (secret, candidate) => {
        try {
          return verifySync({
            secret,
            token: candidate,
            epochTolerance: 30,
          }).valid;
        } catch {
          return false;
        }
      },
      generateBackupCodes: (count) => {
        const codes: string[] = [];
        for (let i = 0; i < count; i++) {
          const raw = randomBytes(8).toString("hex").toUpperCase();
          codes.push(
            `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`
          );
        }
        return codes;
      },
      hashBackupCode: (code) => hashBackupCode(code),
    };

    if (code) {
      const result = await confirmTotpEnrolment(email, code, enrolDeps);
      console.log(result.message);

      if (!result.ok) process.exit(1);

      if (result.backupCodes) {
        const file = resolve("break-glass-backup-codes.txt");
        writeFileSync(
          file,
          [
            `Backup codes for ${email}`,
            "Each one works once, in place of an authenticator code.",
            "",
            ...result.backupCodes,
            "",
          ].join("\n"),
          { mode: 0o600 }
        );
        console.log(`Backup codes written to ${file} (read once, then delete it).`);
      }

      return;
    }

    const staged = await stageTotpEnrolment(email, enrolDeps);

    if (!staged.ok || !staged.otpauthUrl || !staged.secret) {
      console.error(staged.message);
      process.exit(1);
    }

    const file = resolve("break-glass-otpauth.txt");
    writeFileSync(
      file,
      [
        "Add this to your authenticator app (most apps accept a URL or a manual key).",
        "",
        staged.otpauthUrl,
        "",
        `manual key: ${staged.secret}`,
        "",
        "Then run the same command again with --code <the 6 digits it shows>.",
        "",
      ].join("\n"),
      { mode: 0o600 }
    );

    console.log(staged.message);
    console.log(`\nOpen ${file} for the setup URL and key.`);
    console.log(
      "If your app already shows a ShipIN Admin entry, delete it first so you are not reading the old one's codes."
    );
    return;
  }

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
