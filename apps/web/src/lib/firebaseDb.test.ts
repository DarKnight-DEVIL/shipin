// happy-dom so `typeof window` is defined: the emulator connection is
// browser-only, and that is the branch under test.
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getApps: vi.fn(),
  getApp: vi.fn(),
  initializeApp: vi.fn(),
  getAuth: vi.fn(),
  getFirestore: vi.fn(),
  connectFirestoreEmulator: vi.fn(),
}));

vi.mock("firebase/app", () => ({
  getApps: mocks.getApps,
  getApp: mocks.getApp,
  initializeApp: mocks.initializeApp,
}));

vi.mock("firebase/auth", () => ({
  getAuth: mocks.getAuth,
}));

vi.mock("firebase/firestore", () => ({
  getFirestore: mocks.getFirestore,
  connectFirestoreEmulator: mocks.connectFirestoreEmulator,
}));

// The shared setup mocks the app's firebase modules; this file tests the real
// client wiring, so it opts out of both module mocks it would otherwise hit.
vi.unmock("@/lib/firebase");
vi.unmock("@/lib/firebaseDb");

beforeEach(() => {
  vi.resetModules();
  mocks.getApps.mockReset().mockReturnValue([]);
  mocks.getApp.mockReset();
  mocks.initializeApp.mockReset().mockReturnValue({ name: "app" });
  mocks.getAuth.mockReset().mockReturnValue({ name: "auth" });
  mocks.getFirestore.mockReset().mockReturnValue({ name: "firestore" });
});

describe("firebaseDb", () => {
  it("creates the app and firestore client once, then reuses them", async () => {
    const { getFirebaseDb } = await import("./firebaseDb");

    const first = getFirebaseDb();
    const second = getFirebaseDb();

    expect(first).toBe(second);
    expect(first).toEqual({ name: "firestore" });
    expect(mocks.initializeApp).toHaveBeenCalledTimes(1);
    expect(mocks.getFirestore).toHaveBeenCalledTimes(1);
    expect(mocks.getFirestore).toHaveBeenCalledWith({ name: "app" });
  });

  it("reuses a client app another module already initialized", async () => {
    mocks.getApps.mockReturnValue([{ name: "existing" }]);
    mocks.getApp.mockReturnValue({ name: "existing" });

    const { getFirebaseDb } = await import("./firebaseDb");

    getFirebaseDb();

    expect(mocks.initializeApp).not.toHaveBeenCalled();
    expect(mocks.getFirestore).toHaveBeenCalledWith({ name: "existing" });
  });

  it("exports a db handle bound to the same client", async () => {
    const mod = await import("./firebaseDb");

    expect(mod.db).toEqual({ name: "firestore" });
    expect(mocks.getFirestore).toHaveBeenCalledTimes(1);
  });

  it("connects to the Firestore emulator when one is configured", async () => {
    // The host comes from clientEnv, which the shared setup mocks as empty, so
    // replace it for this test only.
    vi.resetModules();
    vi.doMock("@/config/env", () => ({
      clientEnv: {
        NODE_ENV: "test",
        NEXT_PUBLIC_FIREBASE_API_KEY: "test-key",
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "test.firebaseapp.com",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "shipin-e2e",
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "test-bucket",
        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "123456",
        NEXT_PUBLIC_FIREBASE_APP_ID: "1:123456:web:abcdef",
        NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: "",
        NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG: "",
        NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: "",
        NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
      },
      serverEnv: {},
      isProduction: false,
      isDevelopment: true,
      isTest: true,
    }));

    const { getFirebaseDb } = await import("./firebaseDb");
    getFirebaseDb();

    expect(mocks.connectFirestoreEmulator).toHaveBeenCalledWith(
      { name: "firestore" },
      "127.0.0.1",
      8080
    );
  });

  it("initializes when the optional emulator hosts are undefined", async () => {
    // A build without these variables leaves a runtime `process.env` read in
    // the client bundle, which yields `undefined` in the browser instead of the
    // `''` default in `clientEnv`. An unguarded `.trim()` on that value threw
    // during hydration on every Firestore-backed page: a real browser run of
    // `/requests`, `/settings` and `/support` failed this way.
    vi.resetModules();
    vi.doMock("@/config/env", () => ({
      clientEnv: {
        NODE_ENV: "test",
        NEXT_PUBLIC_FIREBASE_API_KEY: "test-key",
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "test.firebaseapp.com",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "shipin-e2e",
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "test-bucket",
        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "123456",
        NEXT_PUBLIC_FIREBASE_APP_ID: "1:123456:web:abcdef",
        NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: "",
        NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG: "",
        NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: undefined as unknown as string,
        NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: undefined as unknown as string,
      },
      serverEnv: {},
      isProduction: false,
      isDevelopment: true,
      isTest: true,
    }));

    const { ensureFirebaseApp } = await import("./firebase");
    const { getFirebaseDb } = await import("./firebaseDb");

    expect(() => ensureFirebaseApp()).not.toThrow();
    expect(() => getFirebaseDb()).not.toThrow();
    expect(mocks.connectFirestoreEmulator).not.toHaveBeenCalled();
  });
});
