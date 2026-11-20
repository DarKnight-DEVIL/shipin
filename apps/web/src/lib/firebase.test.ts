// happy-dom so `typeof window` is defined, matching the browser path.
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getApps: vi.fn(),
  getApp: vi.fn(),
  initializeApp: vi.fn(),
  getAuth: vi.fn(),
}));

vi.mock("firebase/app", () => ({
  getApps: mocks.getApps,
  getApp: mocks.getApp,
  initializeApp: mocks.initializeApp,
}));

vi.mock("firebase/auth", () => ({
  getAuth: mocks.getAuth,
  connectAuthEmulator: vi.fn(),
}));

vi.mock("@/config/env", () => ({
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
  },
  serverEnv: {},
  isProduction: false,
  isDevelopment: true,
  isTest: true,
}));

// The shared setup mocks the app's firebase modules; this file tests the real
// client wiring, so it opts out.
vi.unmock("@/lib/firebase");

beforeEach(() => {
  vi.resetModules();
  mocks.getApps.mockReset().mockReturnValue([]);
  mocks.getApp.mockReset();
  mocks.initializeApp.mockReset().mockReturnValue({ name: "app" });
  mocks.getAuth.mockReset().mockReturnValue({ name: "auth" });
});

describe("firebase auth handle", () => {
  it("does not initialize at import and lazily forwards to the real auth", async () => {
    const mod = await import("./firebase");

    // Importing the module must not create the app or validate client env.
    expect(mocks.initializeApp).not.toHaveBeenCalled();

    // The first property access initializes it.
    expect((mod.auth as unknown as { name: string }).name).toBe("auth");
    expect(mocks.initializeApp).toHaveBeenCalledTimes(1);
  });

  it("forwards _delegate to the same instance getFirebaseAuth returns", async () => {
    const mod = await import("./firebase");

    const delegate = (
      mod.auth as unknown as { _delegate: unknown }
    )._delegate;

    expect(delegate).toBe(mod.getFirebaseAuth());
  });
});
