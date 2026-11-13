/**
 * In-memory Firestore mock for integration tests.
 *
 * Provides a controllable, deterministic Firestore substitute that supports
 * the subset of the firebase-admin API used by ShipIN's server code:
 * collection/doc resolution, get/set/update/delete, FieldValue
 * (serverTimestamp/increment), and runTransaction.
 *
 * This mock never touches the network, so tests cannot corrupt real
 * production data.
 */

export interface MockSnapshot {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

export interface MockDocRef {
  id: string;
  path: string;
  get(): Promise<MockSnapshot>;
  set(data: Record<string, unknown>): Promise<void>;
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
  set(ref: MockDocRef, data: Record<string, unknown>): void;
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

const ServerTimestampSentinel = Symbol('serverTimestamp');
const IncrementPrefix = Symbol('incrementPrefix');
const DeleteSentinel = Symbol('delete');

export const FieldValue = {
  serverTimestamp(): unknown {
    return ServerTimestampSentinel;
  },
  increment(n: number): unknown {
    return { [IncrementPrefix]: n };
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

function isIncrementValue(value: unknown): value is IncrementValue {
  return (
    value !== null &&
    typeof value === 'object' &&
    Object.prototype.hasOwnProperty.call(value, IncrementPrefix)
  );
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
    } else if (v === DeleteSentinel) {
      delete existing[k];
    } else {
      existing[k] = v;
    }
  }

  col.set(docId, existing);
  store.set(colName, col);
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
      async set(data: Record<string, unknown>) {
        const col = store.get(colName) ?? new Map();
        col.set(docId, { ...data });
        store.set(colName, col);
      },
      async update(data: Record<string, unknown>) {
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

  const makeTransaction = (): MockTransaction => ({
    async get(ref: MockDocRef) {
      const [colName, docId] = ref.path.split('/');
      const doc = store.get(colName)?.get(docId);
      return {
        exists: doc !== undefined,
        data: () => (doc ? { ...doc } : undefined),
      };
    },
    set(ref: MockDocRef, data: Record<string, unknown>) {
      const [colName, docId] = ref.path.split('/');
      const col = store.get(colName) ?? new Map();
      col.set(docId, { ...data });
      store.set(colName, col);
    },
    update(ref: MockDocRef, data: Record<string, unknown>) {
      const [colName, docId] = ref.path.split('/');
      applyUpdate(store, colName, docId, data);
    },
    delete(ref: MockDocRef) {
      const [colName, docId] = ref.path.split('/');
      store.get(colName)?.delete(docId);
    },
  });

  return {
    collection: makeCollectionRef,
    doc(path: string) {
      const parts = path.split('/');
      if (parts.length !== 2) throw new Error(`Invalid doc path: ${path}`);
      return makeDocRef(parts[0], parts[1]);
    },
    async runTransaction<T>(fn: (t: MockTransaction) => Promise<T>): Promise<T> {
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