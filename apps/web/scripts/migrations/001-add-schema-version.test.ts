/**
 * Roundtrip test untuk 001-add-schema-version: up lalu down.
 *
 * 001 satu-satunya migrasi yang punya down() — rollback-nya diuji di sini
 * supaya jalur `--down` di migration-runner tidak jalan buta. Fake Firestore
 * memodelkan persis permukaan yang dipakai migrasi: query dengan orderBy/
 * where/limit/startAfter, batch set/update/commit, dan merge semantics.
 */

import { describe, expect, it } from "vitest";

import { up, down, name } from "./001-add-schema-version";

type FakeDoc = { id: string; data: Record<string, unknown>; deleted?: boolean };

function fakeFirestore(store: Record<string, FakeDoc[]>) {
  const committed: Array<Record<string, unknown>> = [];

  const collection = (collName: string) => {
    const docs = () => store[collName] ?? [];
    const query = {
      orderBy: () => query,
      where: (field: string, op: string, value: unknown) => {
        // cukup untuk kebutuhan down: schemaVersion == 1
        (query as unknown as { _where: unknown })._where = { field, op, value };
        return query;
      },
      limit: (n: number) => {
        (query as unknown as { _limit: number })._limit = n;
        return query;
      },
      startAfter: (lastDoc: FakeDoc) => {
        (query as unknown as { _startAfter: string })._startAfter = lastDoc.id;
        return query;
      },
      get: async () => {
        let rows = docs().filter((d) => !d.deleted);
        const meta = query as unknown as {
          _where?: { field: string; op: string; value: unknown };
          _limit?: number;
          _startAfter?: string;
        };
        if (meta._where) {
          rows = rows.filter((d) => d.data[meta._where!.field] === meta._where!.value);
        }
        if (meta._startAfter) {
          const idx = rows.findIndex((d) => d.id === meta._startAfter);
          if (idx >= 0) rows = rows.slice(idx + 1);
        }
        if (meta._limit !== undefined) rows = rows.slice(0, meta._limit);
        return {
          empty: rows.length === 0,
          size: rows.length,
          docs: rows.map((d) => ({
            id: d.id,
            data: () => d.data,
            ref: { id: d.id },
          })),
        };
      },
      doc: (id: string) => ({
        async get() {
          const d = docs().find((x) => x.id === id);
          return { exists: !!d && !d.deleted, data: () => d?.data };
        },
        async delete() {
          const arr = store[collName] ?? [];
          const d = arr.find((x) => x.id === id);
          if (d) d.deleted = true;
        },
      }),
    };
    return query;
  };

  return {
    collection,
    batch() {
      const ops: Array<() => void> = [];
      return {
        set(ref: { id: string }, data: Record<string, unknown>, opts?: { merge?: boolean }) {
          ops.push(() => {
            const all = Object.values(store).flat();
            const d = all.find((x) => x.id === ref.id);
            if (d) d.data = opts?.merge ? { ...d.data, ...data } : data;
          });
        },
        update(ref: { id: string }, data: Record<string, unknown>) {
          ops.push(() => {
            const all = Object.values(store).flat();
            const d = all.find((x) => x.id === ref.id);
            if (d) {
              for (const [k, v] of Object.entries(data)) {
                // FieldValue.delete() adalah object transform, bukan nilai:
                // objek apa pun dalam update dianggap perintah delete field.
                if (v !== null && typeof v === "object") delete d.data[k];
                else d.data[k] = v;
              }
            }
          });
        },
        async commit() {
          for (const op of ops) op();
          committed.push({ ops: ops.length });
          ops.length = 0;
        },
      };
    },
    committed,
  };
}

const FIELD_VALUE_DELETE = "__DELETE__";

describe("001-add-schema-version — up → down roundtrip", () => {
  it("up menandai dokumen tanpa schemaVersion, down menghapusnya kembali", async () => {
    const store: Record<string, FakeDoc[]> = {
      users: [
        { id: "u-1", data: { displayName: "A" } },
        { id: "u-2", data: { displayName: "B", schemaVersion: 1 } }, // sudah pernah
      ],
      requests: [{ id: "r-1", data: { status: "purchased" } }],
      wallets: [{ id: "w-1", data: { balanceMinor: 8470 } }],
      walletTransactions: [],
    };
    const db = fakeFirestore(store);

    // --- up ---
    const upResult = await up(db as never, 500, false);
    expect(upResult.processed).toBe(4); // semua dokumen dilalui, termasuk yang sudah punya
    expect(upResult.failed).toBe(0);
    expect(store.users[0].data.schemaVersion).toBe(1);
    expect(store.users[1].data.schemaVersion).toBe(1); // idempotent, tidak ditulis ulang
    expect(store.requests[0].data.schemaVersion).toBe(1);
    expect(store.wallets[0].data.schemaVersion).toBe(1);

    // --- down ---
    await down(db as never);
    expect(store.users[0].data.schemaVersion).toBeUndefined();
    expect(store.users[1].data.schemaVersion).toBeUndefined();
    expect(store.requests[0].data.schemaVersion).toBeUndefined();
    expect(store.wallets[0].data.schemaVersion).toBeUndefined();
  });

  it("down hanya menyentuh dokumen dengan schemaVersion == 1", async () => {
    const store: Record<string, FakeDoc[]> = {
      users: [
        { id: "u-1", data: { schemaVersion: 1 } },
        { id: "u-2", data: { schemaVersion: 2 } }, // versi lain: bukan urusan 001
        { id: "u-3", data: {} },
      ],
      requests: [],
      wallets: [],
      walletTransactions: [],
    };
    const db = fakeFirestore(store);

    await down(db as never);

    expect(store.users[0].data.schemaVersion).toBeUndefined();
    expect(store.users[1].data.schemaVersion).toBe(2); // tidak disentuh
    expect(store.users[2].data.schemaVersion).toBeUndefined(); // memang tidak pernah ada
  });

  it("nama migrasi terdaftar dan down-nya dapat dipanggil lewat interface runner", async () => {
    expect(name).toBe("001-add-schema-version");
    const mod = await import("./001-add-schema-version");
    expect(typeof mod.down).toBe("function");
  });
});
