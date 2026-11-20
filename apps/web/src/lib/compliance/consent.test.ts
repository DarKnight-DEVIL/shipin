/**
 * Consent records: granting, withdrawing, auditing and the fallbacks used when
 * an audit subcollection is missing.
 *
 * Firestore access is stubbed in this file rather than in a shared helper: the
 * suite runs with `isolate: false`, so a worker shares one module registry and
 * a file whose subject was already evaluated against a different
 * `@/lib/firebaseAdmin` mock would silently reuse that instance. Owning the mock
 * here keeps each file self-contained, and `vi.resetModules()` in the hoisted
 * block clears whatever a previous file left behind before these imports run.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  logConsent,
  getUserConsentState,
  updateUserConsent,
  getConsentLog,
  getGrantedCategories,
  hasValidConsent,
  withdrawConsent,
  isConsentCategory,
  type ConsentCategory,
} from "./consent";
import { PERSONAL_DATA_CATEGORIES } from "./dpdp";

// Runs before this file's imports are evaluated, so the subjects below bind to
// the stubs declared in this file.
vi.hoisted(() => {
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Shared stubs for the Firestore-backed compliance modules.
// ---------------------------------------------------------------------------

function fakeDoc(data: Record<string, unknown>, exists = true) {
  const safeData = { id: "doc-id", ...data };
  const snap = {
    exists,
    data: () => safeData,
    id: safeData.id as string,
  };
  return {
    ...snap,
    get: () => Promise.resolve(snap),
    update: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function fakeCollection(docs: ReturnType<typeof fakeDoc>[]) {
  return {
    doc: (id?: string) => docs.find((d) => d.data().id === id) || docs[0],
    add: vi.fn((_data?: Record<string, unknown>) => ({ id: "added-id" })),
    get: () => ({ docs, empty: docs.length === 0 }),
    where: () => fakeCollection(docs),
    orderBy: () => fakeCollection(docs),
    limit: () => fakeCollection(docs),
  };
}

function fakeBatch() {
  return {
    delete: () => {},
    update: () => {},
    commit: () => Promise.resolve(),
  };
}

// Top-level mocks — installed once via vi.mock so subjects imported at the
// top of this file resolve against these stubs automatically.
const mocks = vi.hoisted(() => ({
  adminDb: {
    collection: vi.fn(() => fakeCollection([])),
    batch: fakeBatch,
  },
  // Return a placeholder object that mimics FieldValue.serverTimestamp()'s .toDate()
  serverTimestamp: vi.fn(() => ({ toDate: () => new Date() })),
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: mocks.adminDb,
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: mocks.serverTimestamp,
  },
}));

beforeEach(() => {
  mocks.adminDb.collection.mockReset();
  mocks.adminDb.collection.mockImplementation(() => fakeCollection([]));
  mocks.serverTimestamp.mockReset();
  mocks.serverTimestamp.mockImplementation(() => ({
    toDate: () => new Date(),
  }));
});

/**
 * `mocks.adminDb.collection` is declared with no parameters, so a per-test
 * implementation that inspects the requested collection name needs a cast
 * rather than a narrower function type.
 */
function stubCollections(
  factory: (name: string) => ReturnType<typeof fakeCollection>
): void {
  (
    mocks.adminDb.collection as unknown as {
      mockImplementation: (
        impl: (name: string) => ReturnType<typeof fakeCollection>
      ) => void;
    }
  ).mockImplementation(factory);
}

describe("compliance consent ops", () => {
  it("logConsent writes the expected audit entry", async () => {
    const collection = fakeCollection([]);
    mocks.adminDb.collection.mockImplementation(() => collection);
    collection.add.mockReturnValue({ id: "log-1" });

    await logConsent({
      userId: "u-1",
      category: "account",
      granted: true,
      version: "1",
      method: "explicit",
      ip: "1.2.3.4",
      userAgent: "test",
    });

    expect(collection.add).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u-1",
        category: "account",
        granted: true,
        version: "1",
        method: "explicit",
      })
    );
  });

  it("getUserConsentState returns the latest entry per category", async () => {
    const older: Record<string, unknown> = {
      userId: "u-1",
      category: "account",
      granted: false,
      version: "0",
      method: "implied",
      timestamp: new Date("2025-01-01"),
    };
    const newer: Record<string, unknown> = {
      userId: "u-1",
      category: "account",
      granted: true,
      version: "1",
      method: "explicit",
      timestamp: new Date("2026-01-01"),
    };
    const collection = fakeCollection([fakeDoc(newer), fakeDoc(older)]);
    mocks.adminDb.collection.mockImplementation(() => collection);

    const state = await getUserConsentState("u-1");
    expect(state.account.granted).toBe(true);
    expect(state.account.version).toBe("1");
    expect(state.account.method).toBe("explicit");
  });

  it("updateUserConsent writes both the log and the quick-lookup doc", async () => {
    const collection = fakeCollection([]);
    mocks.adminDb.collection.mockImplementation(() => collection);
    const userConsentDoc = { set: vi.fn().mockResolvedValue(undefined) };
    collection.doc = vi
      .fn()
      .mockReturnValue(
        userConsentDoc as unknown as ReturnType<typeof fakeCollection>["doc"]
      );

    await updateUserConsent({
      userId: "u-1",
      category: "marketing",
      granted: false,
      version: "2",
      method: "withdrawn",
      ip: "1.2.3.4",
    });

    expect(collection.add).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u-1",
        category: "marketing",
        granted: false,
        version: "2",
        method: "withdrawn",
        ip: "1.2.3.4",
      })
    );
    expect(userConsentDoc.set).toHaveBeenCalledWith(
      expect.objectContaining({
        marketing: expect.objectContaining({
          granted: false,
          version: "2",
          method: "withdrawn",
        }),
      }),
      expect.objectContaining({ merge: true })
    );
  });

  it("getConsentLog returns the most recent entries in descending order", async () => {
    const log1: Record<string, unknown> = {
      userId: "u-1",
      category: "account",
      granted: true,
      version: "1",
      method: "explicit",
      timestamp: new Date("2026-01-01"),
      ip: "1.2.3.4",
      userAgent: "a",
    };
    const log2: Record<string, unknown> = {
      userId: "u-1",
      category: "marketing",
      granted: false,
      version: "2",
      method: "withdrawn",
      timestamp: new Date("2026-02-01"),
      ip: "1.2.3.4",
      userAgent: "b",
    };
    const collection = fakeCollection([fakeDoc(log2), fakeDoc(log1)]);
    mocks.adminDb.collection.mockImplementation(() => collection);

    const logs = await getConsentLog("u-1", 10);
    expect(logs).toHaveLength(2);
    expect(logs[0].category).toBe("marketing");
    expect(logs[0].timestamp).toEqual(new Date("2026-02-01"));
  });

  it("getGrantedCategories returns only granted categories", async () => {
    const granted: Record<string, unknown> = {
      userId: "u-1",
      category: "account",
      granted: true,
      version: "1",
      method: "explicit",
      timestamp: new Date(),
    };
    const denied: Record<string, unknown> = {
      userId: "u-1",
      category: "marketing",
      granted: false,
      version: "1",
      method: "withdrawn",
      timestamp: new Date(),
    };
    const collection = fakeCollection([fakeDoc(denied), fakeDoc(granted)]);
    mocks.adminDb.collection.mockImplementation(() => collection);

    const cats = await getGrantedCategories("u-1");
    expect(cats).toEqual(["account"]);
  });

  it("hasValidConsent returns false for a withdrawn category", async () => {
    const accountEntry: Record<string, unknown> = {
      userId: "u-1",
      category: "account",
      granted: true,
      version: "1",
      method: "explicit",
      timestamp: mocks.serverTimestamp(),
    };
    const marketingEntry: Record<string, unknown> = {
      userId: "u-1",
      category: "marketing",
      granted: false,
      version: "1",
      method: "withdrawn",
      timestamp: mocks.serverTimestamp(),
    };
    const collection = fakeCollection([
      fakeDoc(accountEntry),
      fakeDoc(marketingEntry),
    ]);
    mocks.adminDb.collection.mockImplementation(() => collection);

    const hasAccount = await hasValidConsent("u-1", "account");
    const hasMarketing = await hasValidConsent("u-1", "marketing");
    expect(hasAccount).toBe(true);
    expect(hasMarketing).toBe(false);
  });

  it("withdrawConsent logs the withdrawal", async () => {
    const collection = fakeCollection([]);
    mocks.adminDb.collection.mockImplementation(() => collection);
    collection.add.mockReturnValue({ id: "wd-1" });

    await withdrawConsent("u-1", "analytics", "2", "1.2.3.4", "test");

    expect(collection.add).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u-1",
        category: "analytics",
        granted: false,
        version: "2",
        method: "withdrawn",
        ip: "1.2.3.4",
        userAgent: "test",
      })
    );
  });
});

// ---------------------------------------------------------------------------
// User-facing route logic (the actual 0%-coverage routes)
// ---------------------------------------------------------------------------

describe("compliance consent audit fallbacks", () => {
  it("getConsentLog defaults fields missing from legacy entries", async () => {
    stubCollections(() =>
      fakeCollection([
        fakeDoc({ id: "log-legacy", userId: "user-1", category: "cookie" }),
      ])
    );

    const log = await getConsentLog("user-1");

    expect(log[0]).toMatchObject({
      id: "log-legacy",
      granted: false,
      method: "explicit",
      timestamp: null,
      ip: undefined,
      userAgent: undefined,
    });
  });

  it("getConsentLog keeps populated audit fields", async () => {
    stubCollections(() =>
      fakeCollection([
        fakeDoc({
          id: "log-full",
          userId: "user-1",
          category: "support",
          granted: true,
          method: "withdrawn",
          ip: "203.0.113.10",
          userAgent: "curl/8",
          timestamp: new Date("2026-01-01T00:00:00Z"),
        }),
      ])
    );

    const log = await getConsentLog("user-1", 5);

    expect(log[0]).toMatchObject({
      granted: true,
      method: "withdrawn",
      ip: "203.0.113.10",
      userAgent: "curl/8",
    });
  });

  it("hasValidConsent rejects consent recorded against an older version", async () => {
    stubCollections(() =>
      fakeCollection([
        fakeDoc({
          id: "log-v1",
          userId: "user-1",
          category: "marketing",
          granted: true,
          version: "v1",
          method: "explicit",
          timestamp: new Date(),
        }),
      ])
    );

    await expect(hasValidConsent("user-1", "marketing", "v2")).resolves.toBe(
      false
    );
  });

  it("hasValidConsent accepts consent matching the required version", async () => {
    stubCollections(() =>
      fakeCollection([
        fakeDoc({
          id: "log-v2",
          userId: "user-1",
          category: "marketing",
          granted: true,
          version: "v2",
          method: "explicit",
          timestamp: new Date(),
        }),
      ])
    );

    await expect(hasValidConsent("user-1", "marketing", "v2")).resolves.toBe(
      true
    );
  });

  it("logConsent stores null metadata when absent", async () => {
    const logs = fakeCollection([fakeDoc({ id: "unused" })]);
    stubCollections(() => logs);

    await logConsent({
      userId: "user-1",
      category: "analytics",
      granted: true,
      version: "v1",
      method: "explicit",
    });

    expect(logs.add).toHaveBeenCalledWith(
      expect.objectContaining({ ip: null, userAgent: null })
    );
  });

  it("withdrawConsent records a withdrawn audit entry", async () => {
    const logs = fakeCollection([fakeDoc({ id: "unused" })]);
    stubCollections(() => logs);

    await withdrawConsent("user-1", "marketing", "v2");

    expect(logs.add).toHaveBeenCalledWith(
      expect.objectContaining({ granted: false, method: "withdrawn" })
    );
  });
});

describe("consent category validation", () => {
  it("accepts every declared category and nothing else", () => {
    for (const value of Object.values(PERSONAL_DATA_CATEGORIES)) {
      expect(isConsentCategory(value)).toBe(true);
    }

    expect(isConsentCategory("marketting")).toBe(false);
    expect(isConsentCategory("marketing ")).toBe(false);
    expect(isConsentCategory("")).toBe(false);
    expect(isConsentCategory(undefined)).toBe(false);
  });

  it("logConsent refuses an unknown category before it writes", async () => {
    const logs = fakeCollection([]);
    mocks.adminDb.collection.mockImplementation(() => logs);

    // A request body is untyped JSON, so the cast is what the route would hand
    // over before validation existed.
    await expect(
      logConsent({
        userId: "u-1",
        category: "marketting" as ConsentCategory,
        granted: true,
        version: "1",
        method: "explicit",
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });

    expect(logs.add).not.toHaveBeenCalled();
  });

  it("updateUserConsent refuses a category that would write a nested field", async () => {
    const consents = fakeCollection([]);
    mocks.adminDb.collection.mockImplementation(() => consents);

    await expect(
      updateUserConsent({
        userId: "u-1",
        category: "account.email" as ConsentCategory,
        granted: true,
        version: "1",
        method: "explicit",
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });

    expect(consents.add).not.toHaveBeenCalled();
  });

  it("withdrawConsent refuses an unknown category", async () => {
    const logs = fakeCollection([]);
    mocks.adminDb.collection.mockImplementation(() => logs);

    await expect(
      withdrawConsent("u-1", "nope" as ConsentCategory, "1")
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(logs.add).not.toHaveBeenCalled();
  });
});
// ---------------------------------------------------------------------------
// Rights request core module (rightsOps.ts)
// ---------------------------------------------------------------------------
