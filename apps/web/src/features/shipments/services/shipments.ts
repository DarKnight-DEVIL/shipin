import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
  type DocumentData,
  type FirestoreDataConverter,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
} from "firebase/firestore";

import { db } from "@/lib/firebaseDb";
import type { Shipment } from "@/types/shipment";
import type { Request } from "@/types/request";

/**
 * Firestore documents never store their own id, so reads have to re-attach it.
 * A converter keeps that in one place and gives `data()` its real type instead
 * of a blind cast at every call site.
 */
function withDocumentId<T extends { id: string }>(): FirestoreDataConverter<T> {
  return {
    toFirestore(value: T): DocumentData {
      const { id: _id, ...rest } = value;
      return rest;
    },
    fromFirestore(
      snapshot: QueryDocumentSnapshot,
      options?: SnapshotOptions
    ): T {
      return { ...snapshot.data(options), id: snapshot.id } as T;
    },
  };
}

const shipmentConverter = withDocumentId<Shipment>();
const requestConverter = withDocumentId<Request>();

export async function createShipment(
  userId: string
) {
  const ref = await addDoc(
    collection(db, "shipments"),
    {
      userId,

      requestIds: [],

      status: "building",

      tracking: "",

      courier: "",

      weight: 0,

      length: 0,

      width: 0,

      height: 0,

      createdAt: serverTimestamp(),

      updatedAt: serverTimestamp(),
    }
  );

  return ref.id;
}

export async function addRequestToShipment(
  shipmentId: string,
  requestId: string
) {
  const shipmentRef = doc(
    db,
    "shipments",
    shipmentId
  );

  const requestRef = doc(
    db,
    "requests",
    requestId
  );

  // Both writes describe one fact, so they commit together: a shipment that
  // lists a request the request does not point back to is a corrupt pair.
  await runTransaction(db, async (transaction) => {
    const shipmentSnap = await transaction.get(shipmentRef);

    if (!shipmentSnap.exists()) {
      throw new Error("Shipment not found.");
    }

    transaction.update(shipmentRef, {
      requestIds: arrayUnion(requestId),

      updatedAt: serverTimestamp(),
    });

    transaction.update(requestRef, {
      consolidation: {
        enabled: true,

        shipmentId,

        consolidatedAt:
          serverTimestamp(),
      },
    });
  });
}

export async function getShipment(
  shipmentId: string
): Promise<Shipment | null> {
  const ref = doc(db, "shipments", shipmentId).withConverter(shipmentConverter);

  const snap = await getDoc(ref);

  return snap.exists() ? snap.data() : null;
}

export async function getShipmentRequests(
  shipmentId: string
) {
  const shipment = await getShipment(shipmentId);

  if (!shipment) return [];

  if (
    !shipment.requestIds ||
    shipment.requestIds.length === 0
  ) {
    return [];
  }

  const q = query(
    collection(db, "requests").withConverter(requestConverter),
    where("__name__", "in", shipment.requestIds)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => doc.data());
}

/** Default page size for a customer's shipment list. */
export const SHIPMENTS_PAGE_SIZE = 25;

export interface ShipmentPageOptions {
  pageSize?: number;
  /** Cursor from the previous page's `nextPageAfter`. */
  after?: QueryDocumentSnapshot | null;
}

export interface ShipmentPage {
  shipments: Shipment[];
  /** Pass to the next call as `after`; null once the last page is reached. */
  nextPageAfter: QueryDocumentSnapshot | null;
}

/**
 * One page of a customer's shipments, newest first.
 *
 * Unbounded `where('userId')` reads every document the customer ever shipped,
 * which grows without limit. `orderBy('createdAt')` is safe because
 * `createShipment` always writes that field.
 */
export async function getUserShipmentsPage(
  userId: string,
  options: ShipmentPageOptions = {}
): Promise<ShipmentPage> {
  const pageSize = options.pageSize ?? SHIPMENTS_PAGE_SIZE;

  const constraints: QueryConstraint[] = [
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
    limit(pageSize),
  ];

  if (options.after) constraints.push(startAfter(options.after));

  const q = query(
    collection(db, "shipments").withConverter(shipmentConverter),
    ...constraints
  );

  const snapshot = await getDocs(q);
  const last = snapshot.docs[snapshot.docs.length - 1] ?? null;

  return {
    shipments: snapshot.docs.map((doc) => doc.data()),
    // A short page means there is nothing left to fetch.
    nextPageAfter: snapshot.docs.length === pageSize ? last : null,
  };
}

/** First page of a customer's shipments. */
export async function getUserShipments(
  userId: string,
  options: ShipmentPageOptions = {}
): Promise<Shipment[]> {
  const page = await getUserShipmentsPage(userId, options);

  return page.shipments;
}

/**
 * Every shipment for a customer, read page by page.
 *
 * For callers that genuinely need the whole set (consolidation picks any open
 * shipment). It still never issues one unbounded query.
 */
export async function getAllUserShipments(userId: string): Promise<Shipment[]> {
  const all: Shipment[] = [];
  let after: QueryDocumentSnapshot | null = null;

  do {
    const page = await getUserShipmentsPage(userId, { after });

    all.push(...page.shipments);
    after = page.nextPageAfter;
  } while (after);

  return all;
}

export async function markShipmentShipped(
  shipmentId: string
) {
  await updateDoc(
    doc(db, "shipments", shipmentId),
    {
      status: "shipped",
      shippedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  );
}

export async function markShipmentDelivered(
  shipmentId: string
) {
  await updateDoc(
    doc(db, "shipments", shipmentId),
    {
      status: "delivered",
      deliveredAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  );
}

export async function removeRequestFromShipment(
  shipmentId: string,
  requestId: string
) {
  const shipmentRef = doc(
    db,
    "shipments",
    shipmentId
  );

  const requestRef = doc(
    db,
    "requests",
    requestId
  );

  await runTransaction(db, async (transaction) => {
    transaction.update(shipmentRef, {
      requestIds: arrayRemove(requestId),
      updatedAt: serverTimestamp(),
    });

    transaction.update(requestRef, {
      consolidation: {
        enabled: false,
        shipmentId: null,
        consolidatedAt: null,
      },
    });
  });
}

export async function saveConsolidatedPackage(
  shipmentId: string,
  packageData: {
    weight: number;
    length: number;
    width: number;
    height: number;
  }
) {
  const shipmentRef = doc(
    db,
    "shipments",
    shipmentId
  );

  await updateDoc(shipmentRef, {
    weight: packageData.weight,
    length: packageData.length,
    width: packageData.width,
    height: packageData.height,

    updatedAt: serverTimestamp(),
  });
}

export async function finalizeShipment(
  shipmentId: string
) {
  const shipmentRef = doc(
    db,
    "shipments",
    shipmentId
  );

  const shipmentSnap =
    await getDoc(shipmentRef);

  if (!shipmentSnap.exists()) {
    throw new Error(
      "Shipment not found."
    );
  }

  const shipment =
    shipmentSnap.data();

  if (
    !shipment.requestIds ||
    shipment.requestIds.length === 0
  ) {
    throw new Error(
      "Cannot finalize an empty shipment."
    );
  }

  if (
    !shipment.weight ||
    !shipment.length ||
    !shipment.width ||
    !shipment.height
  ) {
    throw new Error(
      "Enter the final package weight and dimensions before finalizing."
    );
  }

  await updateDoc(shipmentRef, {
    status: "ready",
    finalizedAt:
      serverTimestamp(),
    updatedAt:
      serverTimestamp(),
  });
}