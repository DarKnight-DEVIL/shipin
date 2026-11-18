import { describe, expect, it } from "vitest";

import { createMockFirestore, FieldValue } from "./mockFirestore";

describe("mockFirestore", () => {
  it("resolves sentinels on a plain set, which replaces the document", async () => {
    const db = createMockFirestore();
    const ref = db.collection("users").doc("u1");

    await ref.set({ balance: 5, stale: true });
    await ref.set({ balance: FieldValue.increment(2) });

    const snapshot = await ref.get();
    expect(snapshot.exists).toBe(true);
    expect(snapshot.data()).toEqual({ balance: 2 });
  });

  it("keeps untouched fields when set is asked to merge", async () => {
    const db = createMockFirestore();
    const ref = db.collection("users").doc("u1");

    await ref.set({ balance: 5, name: "Ada" });
    await ref.set({ balance: FieldValue.increment(5) }, { merge: true });

    expect((await ref.get()).data()).toEqual({ balance: 10, name: "Ada" });
  });

  it("writes a timestamp for serverTimestamp", async () => {
    const db = createMockFirestore();
    const before = Date.now();

    await db.collection("requests").doc("r1").set({
      updatedAt: FieldValue.serverTimestamp(),
    });

    const updatedAt = (await db.collection("requests").doc("r1").get()).data()
      ?.updatedAt;
    expect(updatedAt).toBeInstanceOf(Date);
    expect((updatedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("rejects an update of a missing document, like real Firestore", async () => {
    const db = createMockFirestore();

    await expect(
      db.collection("users").doc("missing").update({ name: "Ada" })
    ).rejects.toThrow(/No document to update/);
  });

  it("applies increments, unions, removals and field deletion on update", async () => {
    const db = createMockFirestore();
    const ref = db.collection("requests").doc("r1");

    await ref.set({
      count: 1,
      photos: [{ id: "a" }, { id: "b" }],
      removeMe: true,
    });

    await ref.update({
      count: FieldValue.increment(4),
      photos: FieldValue.arrayUnion({ id: "c" }, { id: "a" }),
      removeMe: FieldValue.delete(),
    });

    expect((await ref.get()).data()).toEqual({
      count: 5,
      photos: [{ id: "a" }, { id: "b" }, { id: "c" }],
    });

    await ref.update({ photos: FieldValue.arrayRemove({ id: "b" }) });

    expect((await ref.get()).data()).toEqual({
      count: 5,
      photos: [{ id: "a" }, { id: "c" }],
    });
  });

  it("applies the same write rules inside a transaction", async () => {
    const db = createMockFirestore();
    const ref = db.collection("counters").doc("tracking");

    await ref.set({ value: 1 });

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const current = Number(snapshot.data()?.value ?? 0);

      transaction.update(ref, { value: current + 1 });
    });

    expect((await ref.get()).data()).toEqual({ value: 2 });

    await expect(
      db.runTransaction(async (transaction) => {
        transaction.update(db.collection("counters").doc("missing"), {
          value: 1,
        });
      })
    ).rejects.toThrow(/No document to update/);
  });

  it("validates document paths and supports seeding and reset", async () => {
    const db = createMockFirestore();

    expect(() => db.doc("only-one-segment")).toThrow(/Invalid doc path/);

    db.seed("users", "u1", { name: "Ada" });
    expect(db.getCollection("users").get("u1")).toEqual({ name: "Ada" });

    db.reset();
    expect(db.getCollection("users").size).toBe(0);
  });
});
