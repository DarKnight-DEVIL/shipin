/**
 * In-memory Firestore mock for integration tests.
 *
 * Provides a controllable, deterministic Firestore substitute that supports
 * the subset of the firebase-admin API used by ShipIN's server code:
 * collection/doc resolution, get/set/update/delete, FieldValue
 * (serverTimestamp/increment/arrayUnion/arrayRemove/delete), and
 * runTransaction.
 *
 * It follows the real SDK where a silent difference would let a test pass and
 * production fail: `set` replaces (or merges) and resolves sentinels, and
 * `update`/transaction `update` reject a missing document the way
 * firebase-admin does with "No document to update". Behaviour that is not
 * modelled here should throw rather than be skipped.
 *
 * This mock never touches the network, so tests cannot corrupt real
 * production data.
 */

export interface MockSnapshot {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

export interface MockSetOptions {
  merge?: boolean;
}

export interface MockDocRef {
  id: string;
  path: string;
  get(): Promise<MockSnapshot>;
  set(data: Record<string, unknown>, options?: MockSetOptions): Promise<void>;
  update(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}

export interface MockCollectionRef {
  id: string;
  path: string;
  doc(docId?: string): MockDocRef;
  add(data: Record<string, unknown>): Promise<MockDocRef>;
}

export interface MockTransaction {
  get(ref: MockDocRef): Promise<MockSnapshot>;
  set(
    ref: MockDocRef,
    data: Record<string, unknown>,
    options?: MockSetOptions
  ): void;
  update(ref: MockDocRef, data: Record<string, unknown>): void;
  delete(ref: MockDocRef): void;
}

export interface MockFirestoreDb {
  collection(name: string): MockCollectionRef;
  doc(path: string): MockDocRef;
  runTransaction<T>(fn: (t: MockTransaction) => Promise<T>): Promise<T>;
  reset(): void;
  getCollection(name: string): Map<string, Record<string, unknown>>;
  /** Inject a document directly (bypasses set/update). */
  seed(colName: string, docId: string, data: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// FieldValue — matches the firebase-admin public API surface used in code.
// ---------------------------------------------------------------------------

const ServerTimestampSentinel = Symbol("serverTimestamp");
const IncrementPrefix = Symbol("incrementPrefix");
const DeleteSentinel = Symbol("delete");
const UnionPrefix = Symbol("arrayUnion");
const RemovePrefix = Symbol("arrayRemove");

export const FieldValue = {
  serverTimestamp(): unknown {
    return ServerTimestampSentinel;
  },
  increment(n: number): unknown {
    return { [IncrementPrefix]: n };
  },
  arrayUnion(...values: unknown[]): unknown {
    return { [UnionPrefix]: values };
  },
  arrayRemove(...values: unknown[]): unknown {
    return { [RemovePrefix]: values };
  },
  delete(): unknown {
    return DeleteSentinel;
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Store = Map<string, Map<string, Record<string, unknown>>>;

type IncrementValue = { [IncrementPrefix]: number };
type UnionValue = { [UnionPrefix]: unknown[] };
type RemoveValue = { [RemovePrefix]: unknown[] };

function hasSymbolKey(value: unknown, key: symbol): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.prototype.hasOwnProperty.call(value, key)
  );
}

function isIncrementValue(value: unknown): value is IncrementValue {
  return hasSymbolKey(value, IncrementPrefix);
}

function isUnionValue(value: unknown): value is UnionValue {
  return hasSymbolKey(value, UnionPrefix);
}

function isRemoveValue(value: unknown): value is RemoveValue {
  return hasSymbolKey(value, RemovePrefix);
}

/** Array elements compare structurally, like Firestore's array values. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? [...value] : [];
}

function applyUpdate(
  store: Store,
  colName: string,
  docId: string,
  data: Record<string, unknown>
): void {
  const col = store.get(colName) ?? new Map();
  const existing = col.get(docId) ?? {};
  for (const [k, v] of Object.entries(data)) {
    if (v === ServerTimestampSentinel) {
      existing[k] = new Date();
    } else if (isIncrementValue(v)) {
      const current = Number(existing[k] ?? 0);
      existing[k] = current + v[IncrementPrefix];
    } else if (isUnionValue(v)) {
      const next = asArray(existing[k]);
      for (const item of v[UnionPrefix]) {
        if (!next.some((current) => sameValue(current, item))) next.push(item);
      }
      existing[k] = next;
    } else if (isRemoveValue(v)) {
      existing[k] = asArray(existing[k]).filter(
        (current) => !v[RemovePrefix].some((item) => sameValue(current, item))
      );
    } else if (v === DeleteSentinel) {
      delete existing[k];
    } else {
      existing[k] = v;
    }
  }

  col.set(docId, existing);
  store.set(colName, col);
}

function applySet(
  store: Store,
  colName: string,
  docId: string,
  data: Record<string, unknown>,
  options: MockSetOptions = {}
): void {
  if (options.merge) {
    applyUpdate(store, colName, docId, data);
    return;
  }

  // A plain set replaces the document, but sentinels still resolve.
  const col = store.get(colName) ?? new Map();
  col.set(docId, {});
  store.set(colName, col);
  applyUpdate(store, colName, docId, data);
}

function requireDoc(store: Store, colName: string, docId: string): void {
  if (!store.get(colName)?.has(docId)) {
    throw new Error(
      `No document to update: ${colName}/${docId} (Firestore rejects an update of a missing document)`
    );
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMockFirestore(): MockFirestoreDb {
  const store: Store = new Map();

  const makeDocRef = (colName: string, docId: string): MockDocRef => {
    const path = `${colName}/${docId}`;
    return {
      id: docId,
      path,
      async get() {
        const doc = store.get(colName)?.get(docId);
        return {
          exists: doc !== undefined,
          data: () => (doc ? { ...doc } : undefined),
        };
      },
      async set(data: Record<string, unknown>, options?: MockSetOptions) {
        applySet(store, colName, docId, data, options);
      },
      async update(data: Record<string, unknown>) {
        requireDoc(store, colName, docId);
        applyUpdate(store, colName, docId, data);
      },
      async delete() {
        store.get(colName)?.delete(docId);
      },
    };
  };

  const makeCollectionRef = (colName: string): MockCollectionRef => ({
    id: colName,
    path: colName,
    doc(docId?: string) {
      const id = docId ?? `auto-${Math.random().toString(36).slice(2, 10)}`;
      return makeDocRef(colName, id);
    },
    async add(data: Record<string, unknown>) {
      const id = `auto-${Math.random().toString(36).slice(2, 10)}`;
      const col = store.get(colName) ?? new Map();
      col.set(id, { ...data });
      store.set(colName, col);
      return makeDocRef(colName, id);
    },
  });

  const makeTransaction = (): MockTransaction => {
    /*
     * Firestore requires every read in a transaction before the first write.
     * The mock used to allow both orders, so a handler that read the wallet
     * after updating the request passed here and failed in production. Track
     * the reads and writes and reject the illegal order instead.
     */
    let hasWritten = false;

    return {
    async get(ref: MockDocRef) {
      if (hasWritten) {
        throw new Error(
          `read after write: ${ref.path} (Firestore requires all transaction reads before the first write)`
        );
      }

      const [colName, docId] = ref.path.split("/");
      const doc = store.get(colName)?.get(docId);
      return {
        exists: doc !== undefined,
        data: () => (doc ? { ...doc } : undefined),
      };
    },
    set(
      ref: MockDocRef,
      data: Record<string, unknown>,
      options?: MockSetOptions
    ) {
      hasWritten = true;
      const [colName, docId] = ref.path.split("/");
      applySet(store, colName, docId, data, options);
    },
    update(ref: MockDocRef, data: Record<string, unknown>) {
      hasWritten = true;
      const [colName, docId] = ref.path.split("/");
      requireDoc(store, colName, docId);
      applyUpdate(store, colName, docId, data);
    },
    delete(ref: MockDocRef) {
      hasWritten = true;
      const [colName, docId] = ref.path.split("/");
      store.get(colName)?.delete(docId);
    },
    };
  };

  return {
    collection: makeCollectionRef,
    doc(path: string) {
      const parts = path.split("/");
      if (parts.length !== 2) throw new Error(`Invalid doc path: ${path}`);
      return makeDocRef(parts[0], parts[1]);
    },
    async runTransaction<T>(
      fn: (t: MockTransaction) => Promise<T>
    ): Promise<T> {
      return fn(makeTransaction());
    },
    reset() {
      store.clear();
    },
    getCollection(name: string) {
      return store.get(name) ?? new Map();
    },
    seed(colName: string, docId: string, data: Record<string, unknown>) {
      const col = store.get(colName) ?? new Map();
      col.set(docId, { ...data });
      store.set(colName, col);
    },
  };
}
