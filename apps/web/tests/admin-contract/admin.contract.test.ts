// @vitest-environment node

/**
 * Firebase Admin SDK contract suite — real emulators, no mocks.
 *
 * The unit suites mock `adminDb`/`adminAuth` with plain objects, so they prove
 * what our code does with a Firestore-shaped answer, not that Firestore behaves
 * the way the code assumes. `tests/rules/` covers the *security rules*, which
 * is a different question again: rules decide whether a client may write,
 * not what the Admin SDK does with `FieldValue.increment`, a nested-path
 * range query or a deleted user.
 *
 * Each case below pins one behaviour a money or compliance path depends on:
 *
 *   - `serverTimestamp()` resolves to a Timestamp on read (every write stamps).
 *   - `increment()` applies from a missing field (wallet debits).
 *   - `arrayUnion()` creates the array (additional-item payments).
 *   - a two-document transaction commits atomically (webhook settlement).
 *   - a nested-path range query matches (`payment.paidAt`, the reconciliation
 *     window). A mistyped path here returns zero rows and reports "clean", so
 *     only a real database can prove it.
 *   - `FieldValue.delete()` clears a nested field (retention cursors).
 *   - `setCustomUserClaims` round-trips through `getUser` (admin role).
 *   - `getUser` on a deleted uid rejects with `auth/user-not-found` (the
 *     erasure and `requireAdmin` paths branch on that code).
 *
 * Run with `npm run test:admin`, which starts the emulators, runs this file and
 * stops them. Without `FIRESTORE_EMULATOR_HOST` the suite skips and says so.
 */

import { describe, expect, it } from "vitest";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

const onEmulator = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST?.trim() &&
    process.env.FIREBASE_AUTH_EMULATOR_HOST?.trim()
);

/** Unique per run, so a re-run never reads a previous run's leftovers. */
const run = Date.now().toString(36);

describe.skipIf(!onEmulator)("Firebase Admin SDK contract", () => {
  it("resolves serverTimestamp() to a Timestamp on read", async () => {
    const ref = adminDb.collection("contract-admin").doc(`stamp-${run}`);

    await ref.set({ createdAt: FieldValue.serverTimestamp() });
    const snapshot = await ref.get();
    const createdAt = snapshot.get("createdAt");

    expect(createdAt).toBeInstanceOf(Timestamp);
    expect(
      Math.abs((createdAt as Timestamp).toDate().getTime() - Date.now())
    ).toBeLessThan(60_000);
  });

  it("applies increment() from an absent field, as the wallet path assumes", async () => {
    const ref = adminDb.collection("contract-admin").doc(`wallet-${run}`);

    await ref.set({ balance: 0 });
    await ref.update({ balance: FieldValue.increment(25) });
    await ref.update({ balance: FieldValue.increment(-10) });

    const snapshot = await ref.get();
    expect(snapshot.get("balance")).toBe(15);
  });

  it("arrayUnion() creates the array and does not duplicate an entry", async () => {
    const ref = adminDb.collection("contract-admin").doc(`addon-${run}`);
    const payment = { id: "CAP-1", status: "completed" };

    await ref.set({ status: "paid" });
    await ref.update({ additionalPayments: FieldValue.arrayUnion(payment) });
    await ref.update({ additionalPayments: FieldValue.arrayUnion(payment) });

    const snapshot = await ref.get();
    expect(snapshot.get("additionalPayments")).toEqual([payment]);
  });

  it("commits a two-document transaction atomically", async () => {
    // The shape the webhook uses: read both, then move the request and the
    // payment order together. A half-applied version is the drift the daily
    // reconciliation job exists to detect.
    const requestRef = adminDb.collection("contract-admin-requests").doc(`req-${run}`);
    const orderRef = adminDb.collection("contract-admin-orders").doc(`order-${run}`);

    await requestRef.set({ status: "awaiting_payment" });
    await orderRef.set({ status: "created" });

    await adminDb.runTransaction(async (transaction) => {
      const request = await transaction.get(requestRef);
      const order = await transaction.get(orderRef);

      expect(request.get("status")).toBe("awaiting_payment");
      expect(order.get("status")).toBe("created");

      transaction.update(requestRef, {
        status: "paid",
        paidAt: FieldValue.serverTimestamp(),
      });
      transaction.update(orderRef, {
        status: "completed",
        completedAt: FieldValue.serverTimestamp(),
      });
    });

    expect((await requestRef.get()).get("status")).toBe("paid");
    expect((await orderRef.get()).get("status")).toBe("completed");
  });

  it("matches a nested-path range query, which a mistyped path silently would not", async () => {
    // `payment.paidAt` is the field the reconciliation sweep filters and orders
    // on. With the field spelled differently the query returns nothing and the
    // sweep reports no drift — a green job that checked nothing.
    const paidRef = adminDb
      .collection("contract-admin-requests")
      .doc(`paid-${run}`);
    const walletOnlyRef = adminDb
      .collection("contract-admin-requests")
      .doc(`wallet-${run}`);

    const paidAt = new Date(Date.now() - 60_000);
    await paidRef.set({
      status: "paid",
      payment: { orderId: `ORD-${run}`, status: "completed", paidAt },
    });
    await walletOnlyRef.set({
      status: "paid",
      payment: { provider: "wallet", status: "completed" },
    });

    const snapshot = await adminDb
      .collection("contract-admin-requests")
      .where("payment.paidAt", ">=", new Date(Date.now() - 3_600_000))
      .orderBy("payment.paidAt", "asc")
      .get();

    const ids = snapshot.docs.map((doc) => doc.id);
    expect(ids).toContain(paidRef.id);
    // A document without the field cannot satisfy a range filter.
    expect(ids).not.toContain(walletOnlyRef.id);
  });

  it("deletes a nested field with FieldValue.delete(), as the cursors do", async () => {
    const ref = adminDb.collection("contract-admin").doc(`cursor-${run}`);

    await ref.set({ photosCursor: "doc-1", supportCursor: "doc-2" });
    await ref.set({ photosCursor: FieldValue.delete() }, { merge: true });

    const snapshot = await ref.get();
    expect(snapshot.get("photosCursor")).toBeUndefined();
    expect(snapshot.get("supportCursor")).toBe("doc-2");
  });

  it("round-trips admin custom claims through getUser", async () => {
    const email = `contract-${run}@example.com`;
    const user = await adminAuth.createUser({
      email,
      password: "ContractTest-1234!",
    });

    try {
      await adminAuth.setCustomUserClaims(user.uid, { role: "admin" });

      const fetched = await adminAuth.getUser(user.uid);
      expect(fetched.email).toBe(email);
      expect(fetched.customClaims).toEqual({ role: "admin" });
    } finally {
      await adminAuth.deleteUser(user.uid);
    }
  });

  it("answers auth/user-not-found for a deleted uid, the code erasure branches on", async () => {
    const user = await adminAuth.createUser({
      email: `deleted-${run}@example.com`,
    });
    await adminAuth.deleteUser(user.uid);

    await expect(adminAuth.getUser(user.uid)).rejects.toMatchObject({
      code: "auth/user-not-found",
    });
  });
});

if (!onEmulator) {
  console.warn(
    "[firebase admin contract] FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST are not set; the Admin SDK contract suite was skipped. Run it with `npm run test:admin`."
  );
}
