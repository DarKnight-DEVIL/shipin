// @vitest-environment happy-dom

/**
 * The lazy `db` handle is a Proxy, and the modular Firestore API normalizes its
 * first argument with `getModularInstance()`, which unwraps `_delegate` before
 * the `instanceof Firestore` check in `doc()`/`collection()`.
 *
 * These assertions run against the real SDK on purpose. `firebaseDb.test.ts`
 * mocks `firebase/firestore`, so it could not see the proxy being rejected:
 * signing in on the running app landed on `/dashboard` with "Dashboard
 * unavailable" and `Expected first argument to doc() to be a
 * CollectionReference, a DocumentReference or FirebaseFirestore`.
 */
import { describe, it, expect, vi } from "vitest";

// The shared setup mocks both app modules; this file needs the real wiring.
vi.unmock("@/lib/firebase");
vi.unmock("@/lib/firebaseDb");

describe("lazy db handle with the real modular API", () => {
  it("is accepted by doc() and collection()", async () => {
    const { doc, collection } = await import("firebase/firestore");
    const { db } = await import("@/lib/firebaseDb");

    expect(doc(db, "users", "user-1").path).toBe("users/user-1");
    expect(collection(db, "users").path).toBe("users");
  });
});
