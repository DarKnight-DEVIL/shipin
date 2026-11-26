/**
 * Tests for the lazy Firebase Admin wiring.
 *
 * The SDK is mocked: these tests cover the parts ShipIN owns — app reuse,
 * private-key normalisation, config validation and the lazy proxies.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vitest.setup.ts mocks this module globally; the real implementation is what
// this suite is here to cover.
vi.unmock("@/lib/firebaseAdmin");

const mocks = vi.hoisted(() => ({
  getApps: vi.fn((): unknown[] => []),
  initializeApp: vi.fn((config: unknown) => ({ app: "initialised", config })),
  cert: vi.fn((credentials: unknown) => ({ credential: credentials })),
  getFirestore: vi.fn((): { collection: (name: string) => string } => ({
    collection: (name: string) => `collection:${name}`,
  })),
  getAuth: vi.fn(() => ({
    verifyIdToken: async (token: string) => ({ uid: token }),
  })),
  serverEnv: {
    FIREBASE_ADMIN_PROJECT_ID: "shipin-test",
    FIREBASE_ADMIN_CLIENT_EMAIL: "admin@shipin.test",
    // Stored on one line with escaped newlines, as in .env files.
    FIREBASE_ADMIN_PRIVATE_KEY:
      "-----BEGIN PRIVATE KEY-----\\nMIIBbody\\n-----END PRIVATE KEY-----",
  },
}));

vi.mock("firebase-admin/app", () => ({
  getApps: mocks.getApps,
  initializeApp: mocks.initializeApp,
  cert: mocks.cert,
}));
vi.mock("firebase-admin/firestore", async (importOriginal) => ({
  // The suite shares one module registry per worker (`isolate: false`), so whichever
  // file imports this module first decides what every other file in that worker sees.
  // This file only needs `getFirestore`, but a mock that dropped the rest of the
  // module once `FieldValue` users were grouped into the same worker — so the real
  // exports are passed through and only the handle is faked.
  ...(await importOriginal()),
  getFirestore: mocks.getFirestore,
}));
vi.mock("firebase-admin/auth", () => ({ getAuth: mocks.getAuth }));
vi.mock("@/config/env", () => ({ serverEnv: mocks.serverEnv }));

beforeEach(() => {
  vi.resetModules();
  // Re-arm every mock explicitly: `resetModules`/`clearAllMocks` together are
  // not enough to guarantee implementations survive between tests.
  mocks.getApps.mockReset().mockReturnValue([]);
  mocks.initializeApp.mockReset().mockImplementation((config: unknown) => ({
    app: "initialised",
    config,
  }));
  mocks.cert.mockReset().mockImplementation((credentials: unknown) => ({
    credential: credentials,
  }));
  mocks.getFirestore.mockReset().mockReturnValue({
    collection: (name: string) => `collection:${name}`,
  });
  mocks.getAuth.mockReset().mockReturnValue({
    verifyIdToken: async (token: string) => ({ uid: token }),
  });
  mocks.serverEnv.FIREBASE_ADMIN_PROJECT_ID = "shipin-test";
  mocks.serverEnv.FIREBASE_ADMIN_CLIENT_EMAIL = "admin@shipin.test";
});

describe("adminDb in emulator mode", () => {
  afterEach(() => {
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  it("starts without a service account when the emulator host is set", async () => {
    // Local E2E: the emulator verifies nothing, so there is no service account
    // and `cert()` must not be called with a placeholder key.
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
    mocks.serverEnv.FIREBASE_ADMIN_PROJECT_ID = "shipin-e2e";

    const { adminDb } = await import("./firebaseAdmin");
    void adminDb.collection;

    expect(mocks.initializeApp).toHaveBeenCalledWith({
      projectId: "shipin-e2e",
    });
    expect(mocks.cert).not.toHaveBeenCalled();
  });
});

describe("adminDb", () => {
  it("initialises lazily with the service account, not at import time", async () => {
    const { adminDb } = await import("./firebaseAdmin");

    expect(mocks.initializeApp).not.toHaveBeenCalled();

    expect(adminDb.collection("requests")).toBe("collection:requests");
    expect(mocks.initializeApp).toHaveBeenCalledTimes(1);
  });

  it("converts escaped newlines in the private key", async () => {
    const { adminDb } = await import("./firebaseAdmin");
    adminDb.collection("requests");

    const credentials = mocks.cert.mock.calls[0][0] as { privateKey: string };
    expect(credentials.privateKey).toContain("\n");
    expect(credentials.privateKey).not.toContain("\\n");
    expect(
      credentials.privateKey.startsWith("-----BEGIN PRIVATE KEY-----")
    ).toBe(true);
  });

  it("reuses an already initialised app", async () => {
    const existing = { name: "[DEFAULT]" };
    mocks.getApps.mockReturnValue([existing]);

    const { adminDb } = await import("./firebaseAdmin");
    adminDb.collection("requests");

    expect(mocks.initializeApp).not.toHaveBeenCalled();
    expect(mocks.getFirestore).toHaveBeenCalledWith(existing);
  });

  it("fails with a CONFIG_ERROR when the service account is incomplete", async () => {
    mocks.serverEnv.FIREBASE_ADMIN_PROJECT_ID = "";

    const { adminDb } = await import("./firebaseAdmin");

    expect(() => adminDb.collection("requests")).toThrow(
      /Missing Firebase Admin environment variables/
    );
    try {
      adminDb.collection("requests");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("CONFIG_ERROR");
    }
  });
});

describe("adminAuth", () => {
  it("binds methods to the auth instance so they can be destructured", async () => {
    const { adminAuth } = await import("./firebaseAdmin");

    const verify = adminAuth.verifyIdToken;

    await expect(verify("user-123")).resolves.toEqual({ uid: "user-123" });
  });
});
