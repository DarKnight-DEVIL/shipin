import fs from "node:fs";

function edit(path, edits) {
  const raw = fs.readFileSync(path, "utf8");
  const crlf = raw.includes("\r\n");
  let s = raw.replace(/\r\n/g, "\n");
  for (const [from, to] of edits) {
    if (!s.includes(from)) throw new Error(`missing in ${path}: ${from.slice(0, 80)}`);
    s = s.split(from).join(to);
  }
  fs.writeFileSync(path, crlf ? s.replace(/\n/g, "\r\n") : s);
  console.log("edited", path);
}

/* 9.3 bounded reads with a cursor */
edit("apps/web/src/features/shipments/services/shipments.ts", [
  [
    `  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,`,
    `  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,`,
  ],
  [
    `export async function getUserShipments(
  userId: string
) {
  const q = query(
    collection(db, "shipments").withConverter(shipmentConverter),
    where("userId", "==", userId)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => doc.data());
}`,
    `/** Default page size for a customer's shipment list. */
export const SHIPMENTS_PAGE_SIZE = 25;

export interface ShipmentPageOptions {
  pageSize?: number;
  /** Cursor from the previous page's \`nextPageAfter\`. */
  after?: QueryDocumentSnapshot | null;
}

export interface ShipmentPage {
  shipments: Shipment[];
  /** Pass to the next call as \`after\`; null once the last page is reached. */
  nextPageAfter: QueryDocumentSnapshot | null;
}

/**
 * One page of a customer's shipments, newest first.
 *
 * Unbounded \`where('userId')\` reads every document the customer ever shipped,
 * which grows without limit. \`orderBy('createdAt')\` is safe because
 * \`createShipment\` always writes that field.
 */
export async function getUserShipmentsPage(
  userId: string,
  options: ShipmentPageOptions = {}
): Promise<ShipmentPage> {
  const pageSize = options.pageSize ?? SHIPMENTS_PAGE_SIZE;

  const constraints = [
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
}`,
  ],
]);

/* 9.3 caller keeps its complete view, now paged */
edit("apps/web/src/components/admin/request/panels/ConsolidationPanel.tsx", [
  [
    `import {
  createShipment,
  addRequestToShipment,
  getUserShipments,
} from "@/features/shipments/services/shipments";`,
    `import {
  createShipment,
  addRequestToShipment,
  getAllUserShipments,
} from "@/features/shipments/services/shipments";`,
  ],
  [
    `        const data = await getUserShipments(request.userId);`,
    `        const data = await getAllUserShipments(request.userId);`,
  ],
]);

/* 9.4 bound the realtime feed */
edit("apps/web/src/features/notifications/services/index.ts", [
  [
    `import {
  collection,
  query,
  where,
  getDocs,
  doc,
  orderBy,
  onSnapshot,
  getDoc,
} from 'firebase/firestore';`,
    `import {
  collection,
  query,
  where,
  limit,
  getDocs,
  doc,
  orderBy,
  onSnapshot,
  getDoc,
} from 'firebase/firestore';`,
  ],
  [
    `export function subscribeToNotifications(
  userId: string,
  callback: (notifications: Notification[]) => void
): () => void {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );`,
    `/**
 * Most recent notifications held live in the browser.
 *
 * The listener used to carry every notification the account had ever received,
 * so a long-lived customer paid for their whole history on each snapshot. The
 * feed and the unread badge only ever show the newest few, so the subscription
 * is bounded; \`useUnreadNotifications\` therefore saturates at this number.
 */
export const NOTIFICATION_FEED_LIMIT = 30;

export function subscribeToNotifications(
  userId: string,
  callback: (notifications: Notification[]) => void
): () => void {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(NOTIFICATION_FEED_LIMIT)
  );`,
  ],
]);

/* 9.4 the badge is a nudge, not an audit count */
edit("apps/web/src/hooks/useUnreadNotifications.ts", [
  [
    ` * Call this inside any client component that needs the badge number. It manages the\r
 * Firestore onSnapshot lifecycle internally and returns \`null\` while unauthenticated.\r
 */`,
    ` * Call this inside any client component that needs the badge number. It manages the\r
 * Firestore onSnapshot lifecycle internally and returns \`null\` while unauthenticated.\r
 *\r
 * The subscription is bounded by \`NOTIFICATION_FEED_LIMIT\`, so the number is the\r
 * unread count within the newest window and saturates at that limit.\r
 */`,
  ],
]);
