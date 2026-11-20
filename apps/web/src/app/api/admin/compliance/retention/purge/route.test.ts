// @vitest-environment node

/**
 * `POST /api/admin/compliance/retention/purge` — the scheduled half of the
 * Privacy Policy's §8 retention table.
 *
 * Two things make this endpoint dangerous if it is wrong: it deletes customer
 * evidence (inspection photos, support transcripts), and it is reachable from
 * the public internet with nothing but a signed cron header. The tests pin the
 * auth gate, then the rules that decide what may be deleted — including the
 * cases where it must refuse to delete.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

interface StoredDoc {
  id: string;
  data(): Record<string, unknown>;
  ref: {
    update(value: Record<string, unknown>): Promise<void>;
    delete(): Promise<void>;
  };
}

const state = {
  requests: [] as StoredDoc[],
  tickets: [] as StoredDoc[],
  messages: [] as StoredDoc[],
  system: undefined as Record<string, unknown> | undefined,
  updates: [] as Array<{ id: string; value: Record<string, unknown> }>,
  deletes: [] as string[],
  sets: [] as Array<{ value: Record<string, unknown>; options?: unknown }>,
  startsAfter: [] as unknown[],
};

const mocks = vi.hoisted(() => ({
  collection: vi.fn(),
  deleteR2Objects: vi.fn(),
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: { collection: mocks.collection },
}));
vi.mock("@/lib/r2Delete", () => ({
  deleteR2Objects: mocks.deleteR2Objects,
}));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: () => "__TS__",
    delete: () => "__DELETE__",
  },
}));

import { POST } from "./route";

const SECRET = "cron-secret-value";
const LONG_AGO = "2023-01-15T00:00:00.000Z";
const PAGE_SIZE = 50;

function storedDoc(id: string, data: Record<string, unknown>): StoredDoc {
  return {
    id,
    data: () => data,
    ref: {
      async update(value) {
        state.updates.push({ id, value });
      },
      async delete() {
        state.deletes.push(id);
      },
    },
  };
}

function buildCollection(name: string) {
  const query = {
    where: () => query,
    orderBy: () => query,
    limit: () => query,
    startAfter: (value: unknown) => {
      state.startsAfter.push(value);
      return query;
    },
    get: async () => {
      const docs =
        name === "requests"
          ? state.requests
          : name === "supportTickets"
            ? state.tickets
            : state.messages;
      return { size: docs.length, docs };
    },
    doc: () => ({
      async get() {
        return {
          exists: state.system !== undefined,
          data: () => state.system ?? {},
        };
      },
      async set(value: Record<string, unknown>, options?: unknown) {
        state.sets.push({ value, options });
      },
    }),
  };

  return query;
}

function signedRequest(secret = SECRET) {
  const timestamp = String(Date.now());
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}|`)
    .digest("hex");

  return new NextRequest(
    "http://localhost/api/admin/compliance/retention/purge",
    {
      method: "POST",
      headers: {
        "x-cron-timestamp": timestamp,
        "x-cron-signature": signature,
      },
    }
  );
}

function bareRequest() {
  return new NextRequest(
    "http://localhost/api/admin/compliance/retention/purge",
    { method: "POST" }
  );
}

beforeEach(() => {
  state.requests = [];
  state.tickets = [];
  state.messages = [];
  state.system = undefined;
  state.updates = [];
  state.deletes = [];
  state.sets = [];
  state.startsAfter = [];

  mocks.collection.mockReset();
  mocks.collection.mockImplementation((name: string) =>
    buildCollection(name)
  );
  mocks.deleteR2Objects.mockReset();
  mocks.deleteR2Objects.mockResolvedValue({ deleted: 1, failed: 0 });
  vi.stubEnv("CRON_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("authorisation", () => {
  it("refuses a request that carries no signed cron headers", async () => {
    const response = await POST(bareRequest());

    expect(response.status).toBe(401);
    expect(state.updates).toEqual([]);
    expect(state.deletes).toEqual([]);
    expect(mocks.deleteR2Objects).not.toHaveBeenCalled();
  });

  it("refuses a signature made with the wrong secret", async () => {
    const response = await POST(signedRequest("not-the-secret"));

    expect(response.status).toBe(401);
  });

  it("refuses to run at all when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = await POST(signedRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      code: "CONFIG_ERROR",
    });
  });
});

describe("inspection photos", () => {
  it("deletes the stored objects and clears every pointer", async () => {
    mocks.deleteR2Objects.mockResolvedValue({ deleted: 2, failed: 0 });
    state.requests = [
      storedDoc("r1", {
        deliveredAt: LONG_AGO,
        warehouse: {
          inspectionPhotos: ["inspection/r1/a.jpg"],
          photos: ["inspection/r1/b.jpg"],
        },
      }),
    ];

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(mocks.deleteR2Objects).toHaveBeenCalledWith([
      "inspection/r1/a.jpg",
      "inspection/r1/b.jpg",
    ]);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].value).toMatchObject({
      "warehouse.inspectionPhotos": [],
      "warehouse.photos": [],
      "warehouse.shippingLabel": null,
      "retention.photosPurgedAt": "__TS__",
    });
    expect(body.photos).toMatchObject({ cleared: 1, objectsDeleted: 2 });
  });

  it("keeps the pointers when storage reports a failure, so a later run can retry", async () => {
    mocks.deleteR2Objects.mockResolvedValue({ deleted: 0, failed: 1 });
    state.requests = [
      storedDoc("r1", {
        deliveredAt: LONG_AGO,
        warehouse: { inspectionPhotos: ["inspection/r1/a.jpg"] },
      }),
    ];

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(state.updates).toEqual([]);
    expect(body.photos).toMatchObject({ cleared: 0, objectsFailed: 1 });
  });

  it("does not touch a delivered request that has no photos left", async () => {
    state.requests = [
      storedDoc("r1", { deliveredAt: LONG_AGO, warehouse: {} }),
    ];

    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
    expect(mocks.deleteR2Objects).not.toHaveBeenCalled();
    expect(state.updates).toEqual([]);
  });

  it("keeps a short page out of the cursor and resets the watermark", async () => {
    state.requests = [storedDoc("r1", { deliveredAt: LONG_AGO })];

    await POST(signedRequest());

    expect(state.sets).toHaveLength(1);
    expect(state.sets[0].value).toMatchObject({
      photosCursor: "__DELETE__",
      supportCursor: "__DELETE__",
    });
  });

  it("advances the cursor to the last row of a full page", async () => {
    state.requests = Array.from({ length: PAGE_SIZE }, (_, index) =>
      storedDoc(`r${index}`, {
        deliveredAt: new Date(Date.UTC(2023, 0, 1 + index)).toISOString(),
      })
    );

    await POST(signedRequest());

    const stored = state.sets[0].value as { photosCursor: unknown };
    // Must be the last row's timestamp, never the cursor that started the page.
    expect(stored.photosCursor).not.toBe("__DELETE__");
    expect(stored.photosCursor).toBe(
      (state.requests.at(-1)!.data() as { deliveredAt: unknown }).deliveredAt
    );
  });

  it("resumes from the stored cursor", async () => {
    state.system = { photosCursor: "2023-06-01T00:00:00.000Z" };

    await POST(signedRequest());

    expect(state.startsAfter).toContain("2023-06-01T00:00:00.000Z");
  });
});

describe("support conversations", () => {
  it("deletes a resolved ticket together with its messages", async () => {
    state.tickets = [
      storedDoc("t1", { status: "resolved", resolvedAt: LONG_AGO }),
    ];
    state.messages = [
      storedDoc("m1", { ticketId: "t1" }),
      storedDoc("m2", { ticketId: "t1" }),
    ];

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(state.deletes).toEqual(["m1", "m2", "t1"]);
    expect(body.support).toMatchObject({
      ticketsDeleted: 1,
      messagesDeleted: 2,
    });
  });

  it("leaves a reopened ticket alone even though it was resolved once", async () => {
    state.tickets = [
      storedDoc("t1", { status: "open", resolvedAt: LONG_AGO }),
    ];
    state.messages = [storedDoc("m1", { ticketId: "t1" })];

    await POST(signedRequest());

    expect(state.deletes).toEqual([]);
  });

  it("refuses to delete a ticket whose date cannot be read", async () => {
    state.tickets = [
      storedDoc("t1", { status: "resolved", resolvedAt: "not a date" }),
    ];

    await POST(signedRequest());

    expect(state.deletes).toEqual([]);
  });
});
