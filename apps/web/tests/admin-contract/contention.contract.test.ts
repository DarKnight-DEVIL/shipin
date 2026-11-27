// @vitest-environment node

/**
 * Firestore contention contract — real emulator, parallel writers, no mocks.
 *
 * The flag these answer: "no load/chaos testing — concurrent wallet top-ups,
 * PayPal webhook flood handling, Firestore contention under load".
 *
 * Two of those premises are already answered elsewhere and are restated here so
 * the suite says what it does and does not claim:
 *
 *   - There are no customer wallet top-ups to race: customers cannot credit
 *     their own wallet (removed; credit is admin-issued), and the wallet *debit*
 *     path (`processWalletPayment`) already runs its balance check and deduction
 *     inside one transaction, with the TOCTOU race it replaced documented in the
 *     source. The unit suite mocks Firestore, so what was never proven is that
 *     the transaction semantics those paths rely on hold under *parallel*
 *     writers — that is what these cases prove, against the real emulator.
 *   - A webhook flood is a dedupe question: `POST /api/webhook` claims each
 *     event id inside a transaction with a lease, and its route test covers two
 *     simultaneous deliveries. Here the same claim shape is hammered with ten
 *     parallel claimers, which is what a PayPal retry storm looks like at the
 *     store level.
 *
 * Each case pins one invariant a money path depends on:
 *
 *   - parallel `increment()` calls never lose an update (admin wallet credit);
 *   - parallel check-then-deduct transactions spend exactly the funded amount —
 *     never one debit more (double-spend) and never a negative balance;
 *   - parallel claims on one event id elect exactly one winner (webhook dedupe).
 *
 * Run with `npm run test:admin`, which starts the emulators, runs this file and
 * stops them. Without the emulator hosts the suite skips and says so.
 */

import { describe, expect, it } from "vitest";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";

const onEmulator = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST?.trim() &&
    process.env.FIREBASE_AUTH_EMULATOR_HOST?.trim()
);

/** Unique per run, so a re-run never reads a previous run's leftovers. */
const run = Date.now().toString(36);

/** Writers per case: enough to overlap on the emulator, small enough to stay fast. */
const WRITERS = 10;

describe.skipIf(!onEmulator)("Firestore contention contract", () => {
  it("never loses a parallel increment, as the admin wallet credit assumes", async () => {
    const ref = adminDb.collection("contract-contention").doc(`credit-${run}`);
    await ref.set({ balance: 0 });

    // The credit route applies `FieldValue.increment(amount)`; the invariant it
    // depends on is that concurrent credits sum exactly, with no lost update.
    await Promise.all(
      Array.from({ length: WRITERS }, () =>
        adminDb.runTransaction(async (transaction) => {
          transaction.update(ref, { balance: FieldValue.increment(10) });
        })
      )
    );

    const snapshot = await ref.get();
    expect(snapshot.get("balance")).toBe(WRITERS * 10);
  });

  it("spends exactly the funded amount under parallel debits, never double-spending", async () => {
    const walletRef = adminDb
      .collection("contract-contention")
      .doc(`wallet-${run}`);
    // 500 minor units, debited 100 at a time: exactly five debits can succeed.
    const FUNDED = 500;
    const PRICE = 100;
    await walletRef.set({ balance: FUNDED });

    const results = await Promise.allSettled(
      Array.from({ length: WRITERS }, () =>
        adminDb.runTransaction(async (transaction) => {
          // The same shape as processWalletPayment: read, check, deduct — all
          // inside the transaction, so a loser retries against the new balance
          // instead of spending against a stale one.
          const snapshot = await transaction.get(walletRef);
          const balance = snapshot.get("balance") as number;

          if (balance < PRICE) {
            throw new Error("INSUFFICIENT_FUNDS");
          }

          transaction.update(walletRef, {
            balance: balance - PRICE,
          });

          return "debited" as const;
        })
      )
    );

    const debited = results.filter(
      (result) => result.status === "fulfilled"
    ).length;
    const refused = results.filter(
      (result) =>
        result.status === "rejected" &&
        (result.reason as Error)?.message === "INSUFFICIENT_FUNDS"
    ).length;

    // Every writer either debited once or was refused: none silently no-ops,
    // and none debits twice.
    expect(debited + refused).toBe(WRITERS);
    expect(debited).toBe(FUNDED / PRICE);
    expect(refused).toBe(WRITERS - FUNDED / PRICE);

    const snapshot = await walletRef.get();
    expect(snapshot.get("balance")).toBe(0);
  });

  it("elects exactly one winner when parallel claimers race one event id", async () => {
    const eventRef = adminDb
      .collection("contract-contention")
      .doc(`event-${run}`);

    const claim = (claimId: string) =>
      adminDb.runTransaction(async (transaction) => {
        // The same shape as the webhook claim: read the marker, claim it only
        // when no live claim exists, and answer "duplicate" otherwise.
        const snapshot = await transaction.get(eventRef);

        if (snapshot.exists) {
          return "duplicate" as const;
        }

        transaction.set(eventRef, {
          status: "claimed",
          claimId,
          claimedAt: Date.now(),
        });

        return "claimed" as const;
      });

    const outcomes = await Promise.all(
      Array.from({ length: WRITERS }, (_, index) => claim(`claim-${index}`))
    );

    expect(outcomes.filter((outcome) => outcome === "claimed")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === "duplicate")).toHaveLength(
      WRITERS - 1
    );

    // The surviving marker names exactly one claimer.
    const snapshot = await eventRef.get();
    expect(snapshot.get("claimId")).toMatch(/^claim-\d$/);
  });
});

if (!onEmulator) {
  console.warn(
    "[firestore contention contract] FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST are not set; the contention suite was skipped. Run it with `npm run test:admin`."
  );
}
