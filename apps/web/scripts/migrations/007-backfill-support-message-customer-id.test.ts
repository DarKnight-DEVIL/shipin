/**
 * Migration 007: support-message owner backfill.
 *
 * The surface the migration uses is deliberately small: a paged query over
 * `supportMessages`, a `get()` of the parent ticket, and `update()` on the
 * message. This fake models exactly that, so the assertions describe the data
 * change rather than SDK call shapes.
 */

import { describe, expect, it } from "vitest";

import { name, up } from "./007-backfill-support-message-customer-id";

type FakeDoc = {
  id: string;
  data: Record<string, unknown>;
};

function fakeFirestore(
  messages: FakeDoc[],
  tickets: Record<string, Record<string, unknown>>
) {
  let pageSize: number | undefined;
  let after: string | undefined;

  const messageQuery = {
    orderBy: () => messageQuery,
    limit: (size: number) => {
      pageSize = size;
      return messageQuery;
    },
    startAfter: (ref: { id: string }) => {
      after = ref.id;
      return messageQuery;
    },
    get: async () => {
      let rows = [...messages];
      if (after) {
        const index = rows.findIndex((row) => row.id === after);
        if (index >= 0) rows = rows.slice(index + 1);
      }
      if (pageSize !== undefined) rows = rows.slice(0, pageSize);
      return {
        empty: rows.length === 0,
        size: rows.length,
        docs: rows.map((row) => ({
          id: row.id,
          data: () => row.data,
          ref: {
            update: async (patch: Record<string, unknown>) => {
              Object.assign(row.data, patch);
            },
          },
        })),
      };
    },
  };

  return {
    collection(collectionName: string) {
      if (collectionName === "supportMessages") {
        return {
          ...messageQuery,
          doc: (id: string) => ({ id }),
        };
      }

      if (collectionName === "supportTickets") {
        return {
          doc: (id: string) => ({
            get: async () => ({
              exists: id in tickets,
              data: () => tickets[id],
            }),
          }),
        };
      }

      throw new Error(`unexpected collection: ${collectionName}`);
    },
  };
}

describe("007-backfill-support-message-customer-id", () => {
  it("copies the parent ticket's owner and leaves owned messages alone", async () => {
    const messages: FakeDoc[] = [
      { id: "m-1", data: { ticketId: "t-1", message: "Legacy" } },
      {
        id: "m-2",
        data: { ticketId: "t-1", customerId: "c-1", message: "Already owned" },
      },
    ];
    const db = fakeFirestore(messages, { "t-1": { customerId: "c-1" } });

    const result = await up(db as never, 100, false);

    expect(result).toEqual({ processed: 2, failed: 0 });
    expect(messages[0].data.customerId).toBe("c-1");
    // The message that already had an owner is not rewritten.
    expect(messages[1].data.customerId).toBe("c-1");
  });

  it("reports a message whose ticket no longer exists instead of guessing", async () => {
    const messages: FakeDoc[] = [
      { id: "m-1", data: { ticketId: "missing", message: "Orphan" } },
    ];
    const db = fakeFirestore(messages, {});

    const result = await up(db as never, 100, false);

    expect(result).toEqual({ processed: 1, failed: 1 });
    expect(messages[0].data.customerId).toBeUndefined();
  });

  it("writes nothing in a dry run", async () => {
    const messages: FakeDoc[] = [
      { id: "m-1", data: { ticketId: "t-1" } },
    ];
    const db = fakeFirestore(messages, { "t-1": { customerId: "c-1" } });

    const result = await up(db as never, 100, true);

    expect(result).toEqual({ processed: 1, failed: 0 });
    expect(messages[0].data.customerId).toBeUndefined();
  });

  it("is registered with the name the runner expects", () => {
    expect(name).toBe("007-backfill-support-message-customer-id");
  });
});
