import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type FirestoreDataConverter,
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

  const shipmentSnap = await getDoc(
    shipmentRef
  );

  if (!shipmentSnap.exists()) {
    throw new Error("Shipment not found.");
  }

  await updateDoc(shipmentRef, {
    requestIds: arrayUnion(requestId),

    updatedAt: serverTimestamp(),
  });

  await updateDoc(requestRef, {
    consolidation: {
      enabled: true,

      shipmentId,

      consolidatedAt:
        serverTimestamp(),
    },
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

export async function getUserShipments(
  userId: string
) {
  const q = query(
    collection(db, "shipments").withConverter(shipmentConverter),
    where("userId", "==", userId)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => doc.data());
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

  await updateDoc(shipmentRef, {
    requestIds: arrayRemove(requestId),
    updatedAt: serverTimestamp(),
  });

  await updateDoc(requestRef, {
    consolidation: {
      enabled: false,
      shipmentId: null,
      consolidatedAt: null,
    },
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