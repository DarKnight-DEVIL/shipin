import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  users: new Map<string, Record<string, unknown>>(),
  secrets: new Map<string, Record<string, unknown>>(),
  userUpdates: [] as Record<string, unknown>[],
  transaction: vi.fn(),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    delete: () => "__DELETE__",
    serverTimestamp: () => "__SERVER_TS__",
  },
}));

vi.mock("@/lib/firebaseAdmin", () => {
  type Snapshot = {
    exists: boolean;
    data: () => Record<string, unknown> | undefined;
  };

  function snapshot(name: string, uid: string): Snapshot {
    const data =
      name === "userSecrets" ? mocks.secrets.get(uid) : mocks.users.get(uid);
    return { exists: data !== undefined, data: () => data };
  }

  function ref(name: string, uid: string) {
    return {
      name,
      uid,
      get: async () => snapshot(name, uid),
      update: async (data: Record<string, unknown>) => {
        if (name === "users") mocks.userUpdates.push(data);
      },
      set: async (
        data: Record<string, unknown>,
        options?: { merge?: boolean }
      ) => {
        if (name !== "userSecrets") return;
        const existing = options?.merge
          ? (mocks.secrets.get(uid) ?? {})
          : undefined;
        mocks.secrets.set(uid, { ...existing, ...data });
      },
      delete: async () => {
        mocks.secrets.delete(uid);
      },
    };
  }

  const adminDb = {
    collection: (name: string) => ({
      doc: (uid: string) => ref(name, uid),
    }),
    runTransaction: mocks.transaction,
  };

  return { adminDb };
});

import {
  loadTotpSecrets,
  parseTotpSecrets,
  userSecretsRef,
} from "./mfaSecrets";

const UID = "admin-1";

function legacyProfile(totp: Record<string, unknown>) {
  return { totp };
}

beforeEach(() => {
  mocks.users.clear();
  mocks.secrets.clear();
  mocks.userUpdates.length = 0;
  mocks.transaction
    .mockReset()
    .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async (target: {
          name: string;
          uid: string;
        }): Promise<{ exists: boolean; data: () => unknown }> => {
          const data =
            target.name === "userSecrets"
              ? mocks.secrets.get(target.uid)
              : mocks.users.get(target.uid);
          return { exists: data !== undefined, data: () => data };
        },
        set: (target: { uid: string }, data: Record<string, unknown>) => {
          mocks.secrets.set(target.uid, data);
        },
        update: (target: { name: string }, data: Record<string, unknown>) => {
          if (target.name === "users") mocks.userUpdates.push(data);
        },
      })
    );
});

describe("mfaSecrets", () => {
  it("reads only the known fields from the server-only record", async () => {
    mocks.secrets.set(UID, {
      totp: {
        secret: "SECRET",
        backupCodes: ["hash-1", "hash-2"],
        lastTotpCodeHash: "abc",
        lastTotpVerifiedAt: 123,
        unexpected: "drop me",
      },
      unrelated: true,
    });

    await expect(loadTotpSecrets(UID)).resolves.toEqual({
      secret: "SECRET",
      backupCodes: ["hash-1", "hash-2"],
      lastTotpCodeHash: "abc",
      lastTotpVerifiedAt: 123,
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("returns an empty record when neither store has one", async () => {
    await expect(loadTotpSecrets(UID)).resolves.toEqual({});
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("migrates a legacy users.mfa.totp record in one transaction", async () => {
    mocks.users.set(UID, {
      mfa: legacyProfile({
        enabled: true,
        secret: "OLD-SECRET",
        backupCodes: ["old-hash"],
        lastTotpVerifiedAt: 99,
      }),
    });

    await expect(
      loadTotpSecrets(UID, (mocks.users.get(UID) as { mfa: unknown }).mfa)
    ).resolves.toEqual({
      secret: "OLD-SECRET",
      backupCodes: ["old-hash"],
      lastTotpVerifiedAt: 99,
    });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.secrets.get(UID)).toMatchObject({
      totp: {
        secret: "OLD-SECRET",
        backupCodes: ["old-hash"],
        lastTotpVerifiedAt: 99,
      },
    });
    expect(mocks.userUpdates).toContainEqual({
      "mfa.totp.secret": "__DELETE__",
      "mfa.totp.backupCodes": "__DELETE__",
      "mfa.totp.lastTotpCodeHash": "__DELETE__",
      "mfa.totp.lastTotpVerifiedAt": "__DELETE__",
      "mfa.totp.lastBackupCodeUsedAt": "__DELETE__",
    });
    // The public flag is not part of the migration's deletes.
    expect(mocks.userUpdates[0]).not.toHaveProperty("mfa.totp");
  });

  it("prefers the server-only record and strips a leftover legacy copy", async () => {
    mocks.secrets.set(UID, { totp: { secret: "NEW-SECRET" } });
    mocks.users.set(UID, {
      mfa: legacyProfile({ enabled: true, secret: "OLD-SECRET" }),
    });

    await expect(
      loadTotpSecrets(UID, (mocks.users.get(UID) as { mfa: unknown }).mfa)
    ).resolves.toEqual({ secret: "NEW-SECRET" });

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.userUpdates[0]).toMatchObject({
      "mfa.totp.secret": "__DELETE__",
    });
  });

  it("never treats a malformed record as a secret", () => {
    expect(
      parseTotpSecrets({
        secret: 123,
        backupCodes: ["ok", 7, ""],
        lastTotpVerifiedAt: "yesterday",
      })
    ).toEqual({ backupCodes: ["ok"] });
    expect(parseTotpSecrets(null)).toEqual({});
  });

  it("deletes the server-only record", async () => {
    mocks.secrets.set(UID, { totp: { secret: "SECRET" } });

    await userSecretsRef(UID).delete();

    expect(mocks.secrets.has(UID)).toBe(false);
  });
});
