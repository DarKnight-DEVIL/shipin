import { describe, expect, it, vi } from "vitest";

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    delete: () => "__DELETE__",
    serverTimestamp: () => "__SERVER_TS__",
  },
}));

import { legacyTotp, up } from "./005-mfa-secrets";

function fakeDb(users: Record<string, Record<string, unknown>>) {
  const secrets = new Map<string, Record<string, unknown>>();
  const userUpdates: Array<{ uid: string; data: Record<string, unknown> }> = [];

  const db = {
    collection(name: string) {
      if (name === "users") {
        return {
          orderBy: () => ({
            limit: () => ({
              startAfter: () => ({
                get: async () => ({ empty: true, size: 0, docs: [] }),
              }),
              get: async () => ({
                empty: Object.keys(users).length === 0,
                size: Object.keys(users).length,
                docs: Object.entries(users).map(([id, data]) => ({
                  id,
                  data: () => data,
                })),
              }),
            }),
          }),
          doc: (uid: string) => ({
            update: async (data: Record<string, unknown>) => {
              userUpdates.push({ uid, data });
            },
          }),
        };
      }

      return {
        doc: (uid: string) => ({
          get: async () => ({
            exists: secrets.has(uid),
            data: () => secrets.get(uid),
          }),
          set: async (data: Record<string, unknown>) => {
            secrets.set(uid, data);
          },
        }),
      };
    },
  };

  return {
    db: db as never,
    secrets,
    userUpdates,
  };
}

describe("legacyTotp", () => {
  it("extracts only secret fields, never the public enabled flag", () => {
    expect(
      legacyTotp({
        mfa: {
          totp: {
            enabled: true,
            secret: "SECRET",
            backupCodes: ["hash-1", 7, ""],
            lastTotpVerifiedAt: 123,
          },
        },
      })
    ).toEqual({
      secret: "SECRET",
      backupCodes: ["hash-1"],
      lastTotpVerifiedAt: 123,
    });
  });

  it("returns null for a migrated profile that only has enabled", () => {
    expect(legacyTotp({ mfa: { totp: { enabled: true } } })).toBe(null);
  });

  it("returns null for malformed or missing records", () => {
    expect(legacyTotp({})).toBe(null);
    expect(legacyTotp({ mfa: {} })).toBe(null);
    expect(legacyTotp({ mfa: { totp: { secret: 42 } } })).toBe(null);
  });
});

describe("migration 005", () => {
  it("does not write during a dry run", async () => {
    const { db, secrets, userUpdates } = fakeDb({
      "user-1": { mfa: { totp: { enabled: true, secret: "OLD" } } },
    });

    const result = await up(db, 450, true);

    expect(result).toEqual({ processed: 1, failed: 0 });
    expect(secrets.size).toBe(0);
    expect(userUpdates).toEqual([]);
  });

  it("moves the secret and removes it from the profile", async () => {
    const { db, secrets, userUpdates } = fakeDb({
      "user-1": {
        mfa: {
          totp: {
            enabled: true,
            secret: "OLD",
            backupCodes: ["hash-1"],
            lastTotpCodeHash: "code-hash",
          },
        },
      },
    });

    const result = await up(db);

    expect(result).toEqual({ processed: 1, failed: 0 });
    expect(secrets.get("user-1")).toMatchObject({
      totp: {
        secret: "OLD",
        backupCodes: ["hash-1"],
        lastTotpCodeHash: "code-hash",
      },
    });
    expect(userUpdates[0]).toEqual({
      uid: "user-1",
      data: {
        "mfa.totp.secret": "__DELETE__",
        "mfa.totp.backupCodes": "__DELETE__",
        "mfa.totp.lastTotpCodeHash": "__DELETE__",
        "mfa.totp.lastTotpVerifiedAt": "__DELETE__",
        "mfa.totp.lastBackupCodeUsedAt": "__DELETE__",
      },
    });
  });

  it("keeps a newer server-only secret and only clears the stale copy", async () => {
    const { db, secrets, userUpdates } = fakeDb({
      "user-1": { mfa: { totp: { enabled: true, secret: "OLD" } } },
    });
    secrets.set("user-1", { totp: { secret: "NEW" } });

    await up(db);

    expect(
      (secrets.get("user-1") as { totp: { secret: string } }).totp.secret
    ).toBe("NEW");
    expect(userUpdates).toHaveLength(1);
  });

  it("does nothing for an account with no TOTP secret", async () => {
    const { db, secrets, userUpdates } = fakeDb({
      "user-1": { mfa: { totp: { enabled: false } } },
    });

    await up(db);

    expect(secrets.size).toBe(0);
    expect(userUpdates).toEqual([]);
  });
});
