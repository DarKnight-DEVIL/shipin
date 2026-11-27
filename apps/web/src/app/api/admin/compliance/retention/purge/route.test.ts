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
  deleted?: boolean;
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
  webhookEvents: [] as StoredDoc[],
  system: undefined as Record<string, unknown> | undefined,
  updates: [] as Array<{ id: string; value: Record<string, unknown> }>,
  deletes: [] as string[],
  sets: [] as Array<{ value: Record<string, unknown>; options?: unknown }>,
  startsAfter: [] as unknown[][],
};

const mocks = vi.hoisted(() => ({
  collection: vi.fn(),
  deleteR2Objects: vi.fn(),
  releaseExpiredWalletHolds: vi.fn(),
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: { collection: mocks.collection },
}));
vi.mock("@/lib/r2Delete", () => ({
  deleteR2Objects: mocks.deleteR2Objects,
}));
vi.mock("@/lib/paypal/walletHolds", () => ({
  releaseExpiredWalletHolds: mocks.releaseExpiredWalletHolds,
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
  const doc: StoredDoc = {
    id,
    data: () => data,
    ref: {
      async update(value) {
        state.updates.push({ id, value });
      },
      async delete() {
        // Mark rather than splice: the caller may hold the array by reference.
        doc.deleted = true;
        state.deletes.push(id);
      },
    },
  };
  return doc;
}

function buildCollection(name: string) {
  // Where conditions are applied by the fake, because the webhook-event purge
  // relies on Firestore's type-aware comparison: a document whose `claimedAt`
  // is missing or not a number must never match the range, so the fake models
  // that instead of returning everything.
  const conditions: Array<{ field: string; op: string; value: number }> = [];
  let limitCount: number | undefined;
  const query = {
    where: (field: string, op: string, value: never) => {
      // `never` accepts every comparison shape the route passes while the
      // numeric filter below still reads `value` as a number.
      conditions.push({ field, op, value: value as number });
      return query;
    },
    orderBy: () => query,
    limit: (count: number) => {
      limitCount = count;
      return query;
    },
    startAfter: (...values: unknown[]) => {
      state.startsAfter.push(values);
      return query;
    },
    get: async () => {
      let docs =
        name === "requests"
          ? state.requests
          : name === "supportTickets"
            ? state.tickets
            : name === "supportMessages"
              ? state.messages
              : name === "paypalWebhookEvents"
                ? state.webhookEvents
                : [];
      // Documents deleted by an earlier run in this test are gone, and must
      // not count toward a page.
      docs = docs.filter((doc) => !doc.deleted);

      /*
       * The webhook-event purge relies on Firestore's type-aware comparison:
       * a marker whose `claimedAt` is missing or not a number must never match
       * the range, so it is never deleted on a guess. The other collections'
       * date filtering happens in the route itself (isPastRetention), so their
       * conditions stay unmodelled here, exactly as before.
       */
      if (name === "paypalWebhookEvents") {
        for (const condition of conditions) {
          docs = docs.filter((doc) => {
            const value = doc.data()[condition.field];
            if (typeof value !== "number") return false;
            if (condition.op === "<") return value < condition.value;
            if (condition.op === "<=") return value <= condition.value;
            return true;
          });
        }
      }

      if (limitCount !== undefined) docs = docs.slice(0, limitCount);

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
  state.webhookEvents = [];
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
  mocks.releaseExpiredWalletHolds.mockReset();
  mocks.releaseExpiredWalletHolds.mockResolvedValue(0);
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
    // Must be the last row's position, never the cursor that started the page.
    // The pair — timestamp plus document id — is what makes it exact: a lone
    // timestamp cannot say where a group of equal timestamps was cut.
    expect(stored.photosCursor).not.toBe("__DELETE__");
    expect(stored.photosCursor).toEqual([
      (state.requests.at(-1)!.data() as { deliveredAt: unknown }).deliveredAt,
      "r49",
    ]);
  });

  it("resumes from the stored pair cursor", async () => {
    state.system = {
      photosCursor: ["2023-06-01T00:00:00.000Z", "req-17"],
      supportCursor: ["2023-07-01T00:00:00.000Z", "ticket-9"],
    };

    await POST(signedRequest());

    expect(state.startsAfter).toContainEqual([
      "2023-06-01T00:00:00.000Z",
      "req-17",
    ]);
    expect(state.startsAfter).toContainEqual([
      "2023-07-01T00:00:00.000Z",
      "ticket-9",
    ]);
  });

  it("treats a cursor it cannot read as no cursor", async () => {
    /*
     * Deployments straddle: a run that stored the old lone-timestamp shape, or a
     * hand-edited state document, must not be fed to `startAfter` as a position —
     * a wrong position skips live data, while restarting from the oldest record
     * only re-scans a page that has already been handled.
     */
    state.system = {
      photosCursor: "2023-06-01T00:00:00.000Z",
      supportCursor: ["2023-07-01T00:00:00.000Z"],
    };

    await POST(signedRequest());

    expect(state.startsAfter).toEqual([]);
  });

  it("stores a null cursor when a full page has no usable timestamp to resume from", async () => {
    // Documents are ordered by `deliveredAt`, so a full page whose rows lack it
    // should not be possible — but the sweep must not write `undefined` into the
    // state document if it happens; it stores null and restarts next run.
    state.requests = Array.from({ length: PAGE_SIZE }, (_, index) =>
      storedDoc(`r${index}`, {})
    );
    state.tickets = Array.from({ length: PAGE_SIZE }, (_, index) =>
      storedDoc(`t${index}`, { status: "open" })
    );

    await POST(signedRequest());

    expect(state.sets[0].value).toMatchObject({
      photosCursor: null,
      supportCursor: null,
    });
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

  it("keeps a ticket resolved inside the window", async () => {
    state.tickets = [
      storedDoc("t1", {
        status: "resolved",
        resolvedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      }),
    ];

    await POST(signedRequest());

    expect(state.deletes).toEqual([]);
  });

  it("advances its own cursor across a full page", async () => {
    state.tickets = Array.from({ length: PAGE_SIZE }, (_, index) =>
      storedDoc(`t${index}`, {
        status: "resolved",
        resolvedAt: new Date(Date.UTC(2023, 0, 1 + index)).toISOString(),
      })
    );

    await POST(signedRequest());

    expect(state.deletes).toHaveLength(PAGE_SIZE);
    expect(state.sets[0].value).toMatchObject({
      supportCursor: [
        (state.tickets.at(-1)!.data() as { resolvedAt: unknown }).resolvedAt,
        "t49",
      ],
    });
  });
});

/* -------------------------------------------------------------------------- */
/* webhook idempotency markers                                                */
/* -------------------------------------------------------------------------- */

describe("paypalWebhookEvents", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const NOW = Date.now();

  function marker(id: string, claimedAt: number | string | undefined) {
    const doc = storedDoc(id, {
      status: "processed",
      claimId: `claim-${id}`,
      eventType: "PAYMENT.CAPTURE.COMPLETED",
      ...(claimedAt === undefined ? {} : { claimedAt }),
    });
    state.webhookEvents.push(doc);
    return doc;
  }

  it("deletes markers past the retention window", async () => {
    marker("evt-old", NOW - 40 * DAY_MS);

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(body.webhookEvents).toEqual({ scanned: 1, deleted: 1 });
    expect(state.deletes).toContain("evt-old");
  });

  it("keeps markers inside the window", async () => {
    marker("evt-fresh", NOW - 2 * DAY_MS);

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(body.webhookEvents).toEqual({ scanned: 0, deleted: 0 });
    expect(state.deletes).not.toContain("evt-fresh");
  });

  it("never deletes a marker whose claimedAt it cannot read", async () => {
    marker("evt-string", "not-a-number");
    marker("evt-missing", undefined);

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(body.webhookEvents).toEqual({ scanned: 0, deleted: 0 });
    expect(state.deletes).toEqual([]);
  });

  it("drains a backlog across runs", async () => {
    // A full page of eligible markers: one run deletes PAGE_SIZE, and a short
    // page on the next run means the backlog is gone.
    for (let i = 0; i < PAGE_SIZE; i++) {
      marker(`evt-bulk-${i}`, NOW - 40 * DAY_MS);
    }
    marker("evt-left", NOW - 40 * DAY_MS);

    await POST(signedRequest());
    expect(state.deletes).toHaveLength(PAGE_SIZE);

    await POST(signedRequest());
    expect(state.deletes).toContain("evt-left");
  });
});

describe("wallet holds", () => {
  it("releases expired holds as part of the run", async () => {
    mocks.releaseExpiredWalletHolds.mockResolvedValue(2);

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(mocks.releaseExpiredWalletHolds).toHaveBeenCalledTimes(1);
    expect(body.holdsReleased).toBe(2);
  });

  it("survives a hold-release failure and reports it", async () => {
    mocks.releaseExpiredWalletHolds.mockRejectedValue(new Error("store down"));

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.holdsReleased).toBe(0);
    expect(body.warning).toContain("wallet-hold");
  });
});
