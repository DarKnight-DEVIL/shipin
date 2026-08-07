import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  Timestamp,
  arrayUnion,
  writeBatch,
} from "firebase/firestore";

import { db } from "./firebase";
import type { Request, Quote } from "@/types/request";
// Fix 1: Added explicit type import for Address
import type { Address } from "@/types/address";
import type { Carrier } from "@/types/carrier";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from "@/types/notificationPreferences";

/* =========================================
   ADDRESSES
========================================= */

export const addAddress = async (
  address: any,
  userId: string
) => {
  await addDoc(collection(db, "addresses"), {
    ...address,
    userId,
    createdAt: serverTimestamp(),
  });
};

// Fix 2: Replaced getAddresses with strongly-typed map implementation
export const getAddresses = async (
  userId: string
): Promise<Address[]> => {
  const q = query(
    collection(db, "addresses"),
    where("userId", "==", userId)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map(
    (doc) =>
      ({
        id: doc.id,
        ...(doc.data() as Omit<Address, "id">),
      }) as Address
  );
};

/* =========================================
   REQUESTS
========================================= */

export const addRequest = async (
  requestData: any,
  userId: string
) => {
  await addDoc(collection(db, "requests"), {
    userId,

    customerName: requestData.customerName,
    email: requestData.email,

    items: requestData.items,
    
    // Updated: addressId deleted, shippingAddress object field added instead
    shippingAddress: requestData.shippingAddress,
    
    notes: requestData.notes,

    serviceSelections: {
      inspection:
        requestData.serviceSelections?.inspection ??
        "standard",

      shippingPreference:
        requestData.serviceSelections
          ?.shippingPreference ??
        "approval",
    },

    status: "submitted",

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const getRequests = async (
  userId: string
): Promise<Request[]> => {
  const q = query(
    collection(db, "requests"),
    where("userId", "==", userId)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  })) as Request[];
};

export const getRequestById = async (
  requestId: string
): Promise<Request | null> => {
  const snapshot = await getDoc(
    doc(db, "requests", requestId)
  );

  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...snapshot.data(),
  } as Request;
};

export const updateRequestStatus = async (
  requestId: string,
  status: string
) => {
  const requestRef = doc(
    db,
    "requests",
    requestId
  );

  await updateDoc(requestRef, {
    status,
    updatedAt: serverTimestamp(),
  });
};

/* =========================================
   ITEM LEVEL QUOTES
========================================= */

export const saveDetailedQuote = async (
  requestId: string,
  quote: Quote
) => {
  const requestRef = doc(
    db,
    "requests",
    requestId
  );

  // Read the current document data to see if a quote already exists
  const snapshot = await getDoc(requestRef);
  const existingData = snapshot.exists() ? snapshot.data() : null;
  const existingQuote = existingData?.quote;
  const userId = existingData?.userId;

  await updateDoc(requestRef, {
    quote: {
      version: existingQuote?.version
        ? existingQuote.version + 1
        : 1,

      items: quote.items,
      
      breakdown: {
        productsTotal: quote.breakdown?.productsTotal,
        domesticShipping: quote.breakdown?.domesticShipping,
        internationalShipping: quote.breakdown?.internationalShipping,
        serviceFee: quote.breakdown?.serviceFee,
        grandTotal: quote.breakdown?.grandTotal,
      },

      serviceFeeRule: quote.serviceFeeRule,
      
      createdAt:
        existingQuote?.createdAt ??
        serverTimestamp(),

      updatedAt: serverTimestamp(),

      expiresAt: Timestamp.fromMillis(
        Date.now() + 24 * 60 * 60 * 1000
      ),

      acceptedAt: null,

      regenerationRequested: false,

      regeneratedCount:
        (existingQuote?.regeneratedCount ?? 0) + 1,

      expired: false,
    },
    
    status: "review",
    quoteCreatedAt: existingQuote?.quoteCreatedAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (userId) {
    await createNotification(userId, requestId, "Quote Ready", "Your quote has been generated.", "quote");
  }
};

/* =========================================
   PAYMENT
========================================= */

export const markRequestPaid = async (
  requestId: string,
  paymentData: {
    orderId: string;
    captureId?: string;
    amount: number;
    provider?: "paypal" | "wallet";
  }
) => {
  const requestRef = doc(
    db,
    "requests",
    requestId
  );

  const snapshot = await getDoc(requestRef);
  const userId = snapshot.exists() ? snapshot.data()?.userId : null;

  await updateDoc(requestRef, {
    status: "paid",

    payment: {
      provider: paymentData.provider ?? "paypal",
      orderId:
        paymentData.orderId,
      captureId:
        paymentData.captureId ||
        null,
      amountPaid:
        paymentData.amount,
      paidAt:
        serverTimestamp(),
    },

    updatedAt:
      serverTimestamp(),
  });

  if (userId) {
    await createNotification(userId, requestId, "Payment Received", "Your payment has been successfully recorded.", "payment");
  }
};

export async function recordPayment(
  requestId: string,
  paymentData: {
    provider: "paypal" | "wallet";
    amount: number;
    orderId: string;
    captureId?: string;
  }
) {
  const requestRef = doc(db, "requests", requestId);

  const snapshot = await getDoc(requestRef);

  if (!snapshot.exists()) {
    throw new Error("Request not found");
  }

  const request = snapshot.data();

  const previousPaid =
    request.payment?.amountPaid ?? 0;

  const grandTotal =
    request.quote?.breakdown?.grandTotal ?? 0;

  const totalPaid =
    previousPaid + paymentData.amount;

  const isFullyPaid =
    totalPaid >= grandTotal - 0.01;

  await updateDoc(requestRef, {

    payment: {

      provider: paymentData.provider,

      orderId: paymentData.orderId,

      captureId:
        paymentData.captureId ?? null,

      amountPaid: totalPaid,

      paidAt: serverTimestamp(),

    },

    status: isFullyPaid
      ? "paid"
      : "awaiting_payment",

    updatedAt: serverTimestamp(),

  });
}

/* =========================================
   SHIPMENT TRACKING
========================================= */

export const saveShipmentDetails = async (
  requestId: string,
  shipment: {
    internalTrackingId: string;
    carrier: Carrier;
    trackingNumber: string;
    estimatedDelivery: string;
    trackingUrl: string;
    createdAt: Timestamp;
  }
) => {
  const requestRef = doc(
    db,
    "requests",
    requestId
  );

  await updateDoc(requestRef, {
    tracking: {
      internalTrackingId:
        shipment.internalTrackingId,

      carrier:
        shipment.carrier,

      trackingNumber:
        shipment.trackingNumber,

      estimatedDelivery:
        shipment.estimatedDelivery,

      trackingUrl:
        shipment.trackingUrl,

      createdAt:
        shipment.createdAt,
    },

    updatedAt:
      serverTimestamp(),
  });
};

export const updateShipmentStatus = async (
  requestId: string,
  status: string
) => {
  const requestRef = doc(db, "requests", requestId);
  const snapshot = await getDoc(requestRef);
  const userId = snapshot.exists() ? snapshot.data()?.userId : null;

  await updateDoc(requestRef, {
    status,

    [`statusHistory.${status}`]:
      serverTimestamp(),

    updatedAt: serverTimestamp(),
  });

  if (userId) {
    if (status === "shipped") {
      await createNotification(userId, requestId, "Package Shipped", "Your package has left the warehouse.", "shipping");
    } else if (status === "delivered") {
      await createNotification(userId, requestId, "Delivered", "Your package has been safely delivered.", "shipping");
    }
  }
};

/* =========================================
   ADMIN FUNCTIONS & NOTIFICATIONS
========================================= */

export const getAllRequests = async () => {
  const snapshot = await getDocs(
    collection(db, "requests")
  );

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
};

export const getRequestsByStatus = async (
  status: string
) => {
  const q = query(
    collection(db, "requests"),
    where("status", "==", status)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
};

/* =========================================
   NOTIFICATION PREFERENCES
========================================= */

export async function getNotificationPreferences(
  userId: string
): Promise<NotificationPreferences> {
  const userRef = doc(
    db,
    "users",
    userId
  );

  const snapshot =
    await getDoc(userRef);

  if (!snapshot.exists()) {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }

  const saved =
    snapshot.data()
      ?.preferences
      ?.notifications;

  if (!saved) {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }

  /*
   * Merge with defaults so future
   * preference fields don't break
   * existing users.
   */
  return {
    channels: {
      ...DEFAULT_NOTIFICATION_PREFERENCES.channels,
      ...(saved.channels ?? {}),
    },

    whatsapp: {
      ...DEFAULT_NOTIFICATION_PREFERENCES.whatsapp,
      ...(saved.whatsapp ?? {}),
    },

    categories: {
      ...DEFAULT_NOTIFICATION_PREFERENCES.categories,
      ...(saved.categories ?? {}),
    },
  };
}

export async function saveNotificationPreferences(
  userId: string,
  preferences: NotificationPreferences
) {
  const userRef = doc(
    db,
    "users",
    userId
  );

  await updateDoc(userRef, {
    "preferences.notifications":
      preferences,

    preferencesUpdatedAt:
      serverTimestamp(),
  });
}

export const createNotification = async (
  userId: string,
  requestId: string,
  title: string,
  message: string,
  type: string
) => {
  await addDoc(
    collection(db, "notifications"),
    {
      userId,
      requestId,
      title,
      message,
      type,
      read: false,
      createdAt: serverTimestamp(),
    }
  );
};

export const getNotifications = async (
  userId: string
) => {
  const q = query(
    collection(db, "notifications"),
    where("userId", "==", userId)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
};

export const markNotificationRead = async (
  notificationId: string
) => {
  const notificationRef = doc(
    db,
    "notifications",
    notificationId
  );

  await updateDoc(notificationRef, {
    read: true,
  });
};

/*
 * Delete one notification
 */
export async function deleteNotification(
  notificationId: string
) {
  await deleteDoc(
    doc(db, "notifications", notificationId)
  );
}

/*
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsRead(
  userId: string
) {
  const snapshot = await getDocs(
    collection(db, "notifications")
  );

  const batch = writeBatch(db);

  snapshot.docs.forEach((notificationDoc) => {
    const data = notificationDoc.data();

    if (
      data.userId === userId &&
      data.read !== true
    ) {
      batch.update(notificationDoc.ref, {
        read: true,
      });
    }
  });

  await batch.commit();
}

/*
 * Delete all READ notifications for a user
 */
export async function clearReadNotifications(
  userId: string
) {
  const snapshot = await getDocs(
    collection(db, "notifications")
  );

  const batch = writeBatch(db);

  snapshot.docs.forEach((notificationDoc) => {
    const data = notificationDoc.data();

    if (
      data.userId === userId &&
      data.read === true
    ) {
      batch.delete(notificationDoc.ref);
    }
  });

  await batch.commit();
}

/* =========================================
   REALTIME LISTENERS
========================================= */

export const subscribeToNotifications = (
  userId: string,
  callback: (notifications: any[]) => void
) => {
  const q = query(
    collection(db, "notifications"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    const notifications =
      snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

    callback(notifications);
  });
};

export const subscribeToRequests = (
  userId: string,
  callback: (requests: any[]) => void
) => {
  const q = query(
    collection(db, "requests"),
    where("userId", "==", userId)
  );

  return onSnapshot(q, (snapshot) => {
    const requests = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    callback(requests);
  });
};

/* =========================================
   SUPPORT TICKETS & MESSAGING (COLLECTIONS)
========================================= */

export const createSupportTicket = async ({
  requestId,
  customerId,
  category,
  subject,
  firstMessage,
}: {
  requestId: string;
  customerId: string;
  category: string;
  subject: string;
  firstMessage: string;
}) => {
  // Create the ticket
  const ticketRef = await addDoc(
    collection(db, "supportTickets"),
    {
      requestId,
      customerId,
      category,
      subject,
      status: "open",
      customerUnread: false,
      adminUnread: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      resolvedAt: null,
    }
  );

  const ticketNumber = `TCK-${ticketRef.id
    .substring(0, 6)
    .toUpperCase()}`;

  await updateDoc(
    doc(db, "supportTickets", ticketRef.id),
    {
      ticketNumber,
    }
  );

  // Create the first message
  await addDoc(
    collection(db, "supportMessages"),
    {
      ticketId: ticketRef.id,
      sender: "customer",
      message: firstMessage,
      createdAt: serverTimestamp(),
    }
  );

  return ticketRef.id;
};

export const sendSupportMessage = async ({
  ticketId,
  sender,
  message,
}: {
  ticketId: string;
  sender: "customer" | "admin";
  message: string;
}) => {
  await addDoc(
    collection(db, "supportMessages"),
    {
      ticketId,
      sender,
      message,
      createdAt: serverTimestamp(),
    }
  );

  await updateDoc(
    doc(db, "supportTickets", ticketId),
    {
      updatedAt: serverTimestamp(),
      adminUnread: sender === "customer",
      customerUnread: sender === "admin",
    }
  );
};

export const markSupportTicketRead = async (
  ticketId: string,
  role: "customer" | "admin"
) => {
  await updateDoc(
    doc(db, "supportTickets", ticketId),
    role === "customer"
      ? {
          customerUnread: false,
        }
      : {
          adminUnread: false,
        }
  );
};

export const getSupportTickets = async (
  requestId: string
) => {
  const q = query(
    collection(db, "supportTickets"),
    where("requestId", "==", requestId),
    orderBy("updatedAt", "desc")
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
};

export const getSupportMessages = async (
  ticketId: string
) => {
  const q = query(
    collection(db, "supportMessages"),
    where("ticketId", "==", ticketId),
    orderBy("createdAt")
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
};

export const resolveSupportTicket = async (
  ticketId: string
) => {
  await updateDoc(
    doc(db, "supportTickets", ticketId),
    {
      status: "resolved",
      resolvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  );
};

export const subscribeToSupportTickets = (
  requestId: string,
  callback: (tickets: any[]) => void
) => {
  const q = query(
    collection(db, "supportTickets"),
    where("requestId", "==", requestId),
    orderBy("updatedAt", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    callback(
      snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
    );
  });
};

export const subscribeToSupportMessages = (
  ticketId: string,
  callback: (messages: any[]) => void
) => {
  const q = query(
    collection(db, "supportMessages"),
    where("ticketId", "==", ticketId),
    orderBy("createdAt")
  );

  return onSnapshot(q, (snapshot) => {
    callback(
      snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
    );
  });
};

/* =========================================
   WAREHOUSE PROCESSING
========================================= */

export async function saveWarehouseMeasurements(
  requestId: string,
  data: {
    weight: number;
    length: number;
    width: number;
    height: number;
  }
) {
  await updateDoc(doc(db, "requests", requestId), {
    "warehouse.weight": data.weight,
    "warehouse.length": data.length,
    "warehouse.width": data.width,
    "warehouse.height": data.height,

    updatedAt: serverTimestamp(),
  });
}

export async function updateWarehouseChecklist(
  requestId: string,
  checklist: {
    packageReceived?: boolean;
    inspectionCompleted?: boolean;
    photosUploaded?: boolean;
    measured?: boolean;
    readyForShipment?: boolean;
  }
) {
  const requestRef = doc(db, "requests", requestId);
  const snapshot = await getDoc(requestRef);
  const userId = snapshot.exists() ? snapshot.data()?.userId : null;

  const updates: Record<string, any> = {};

  Object.entries(checklist).forEach(([key, value]) => {
    updates[`warehouse.checklist.${key}`] = value;
  });

  updates.updatedAt = serverTimestamp();

  await updateDoc(
    requestRef,
    updates
  );

  if (userId && checklist.packageReceived === true) {
    await createNotification(userId, requestId, "Package Arrived", "Your package has been checked into our warehouse.", "warehouse");
  }
}

export async function saveInspectionPhoto(
  requestId: string,
  photo: {
    id: string;
    url: string;
    caption?: string;
  }
) {
  await updateDoc(doc(db, "requests", requestId), {
    "warehouse.inspectionPhotos": arrayUnion({
      ...photo,
      uploadedAt: serverTimestamp(),
    }),

    updatedAt: serverTimestamp(),
  });
}

export async function saveInspectionPhotos(
  requestId: string,
  photos: string[]
) {
  const requestRef = doc(db, "requests", requestId);

  const snapshot = await getDoc(requestRef);

  const userId = snapshot.exists()
    ? snapshot.data()?.userId
    : null;

  await updateDoc(requestRef, {
    "warehouse.inspectionPhotos": photos,
    updatedAt: serverTimestamp(),
  });

  if (userId) {
    await createNotification(
      userId,
      requestId,
      "Inspection Complete",
      "Your warehouse inspection photos are now available.",
      "warehouse"
    );
  }
}

export async function approveInternationalShipment(
  requestId: string
) {
  await updateDoc(
    doc(db, "requests", requestId),
    {
      status: "ready_for_international_shipping",

      approvedAt: serverTimestamp(),

      updatedAt: serverTimestamp(),
    }
  );
}

export async function startStorageTimer(
  requestId: string
) {
  const now = Timestamp.now();

  const freeUntil = Timestamp.fromMillis(
    now.toMillis() +
      48 * 60 * 60 * 1000
  );

  await updateDoc(
    doc(db, "requests", requestId),
    {
      storage: {
        startedAt: now,

        freeUntil,

        dailyFine: 3,

        accumulatedFine: 0,

        active: true,
      },

      updatedAt: serverTimestamp(),
    }
  );
}

/* =========================================
   SAVE WAREHOUSE INSPECTION
========================================= */

export async function saveWarehouseInspection(
  requestId: string,
  data: {
    weight: number;
    length: number;
    width: number;
    height: number;
    condition: string;
  }
) {
  const requestRef = doc(
    db,
    "requests",
    requestId
  );

  await updateDoc(requestRef, {
    "warehouse.weight": data.weight,
    "warehouse.length": data.length,
    "warehouse.width": data.width,
    "warehouse.height": data.height,
    "warehouse.condition": data.condition,
    updatedAt: serverTimestamp(),
  });
}