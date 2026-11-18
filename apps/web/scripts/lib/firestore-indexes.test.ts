/**
 * Tests for the Firestore index analysis.
 *
 * Each case here is a shape that lives in this codebase: the gate used to call
 * the equality-only ones missing indexes (they are served by the automatic
 * single-field indexes) while verifying none of the real filter+order ones.
 */

import { describe, it, expect } from "vitest";

import {
  blankComments,
  indexCovers,
  readQueries,
  requirementsFor,
} from "./firestore-indexes.mjs";

const requirements = (source: string) =>
  readQueries(source).sites.flatMap((site) => requirementsFor(site));

describe("readQueries", () => {
  it("requires nothing for an equality-only lookup", () => {
    // api/admin/users: role == "admin", no ordering.
    const source = `
      const admins = await adminDb.collection("users").where("role", "==", "admin").get();
    `;

    expect(requirements(source)).toEqual([]);
  });

  it("requires nothing for a nested-field equality lookup", () => {
    // shipments/trackingSync: tracking.internalTrackingId == id, limit(1).
    const source = `
      const byInternalId = await adminDb
        .collection("requests")
        .where("tracking.internalTrackingId", "==", trackingId)
        .limit(1)
        .get();
    `;

    expect(requirements(source)).toEqual([]);
  });

  it("requires nothing for a document-id lookup", () => {
    // shipments/shipments: where("__name__", "in", requestIds).
    const source = `
      const q = query(
        collection(db, "requests").withConverter(requestConverter),
        where("__name__", "in", requestIds)
      );
    `;

    expect(requirements(source)).toEqual([]);
  });

  it("requires nothing for an order with no filter", () => {
    const source = `const q = adminDb.collection("supportTickets").orderBy("createdAt", "desc");`;

    expect(requirements(source)).toEqual([]);
  });

  it("requires an index for a filter combined with an order", () => {
    // requests/subscribeToRequests.
    const source = `
      const q = query(
        collection(db, "requests"),
        where("userId", "==", userId),
        orderBy("createdAt", "desc"),
        limit(200)
      );
    `;

    expect(requirements(source)).toEqual([
      expect.objectContaining({
        collection: "requests",
        equals: ["userId"],
        order: { field: "createdAt", direction: "DESCENDING" },
      }),
    ]);
  });

  it("keeps an order chained onto an earlier query() with its filters", () => {
    // requests/getRequests builds the query in two statements.
    const source = `
      let q = query(collection(db, "requests"), where("userId", "==", userId));
      q = query(q, orderBy("createdAt", "desc"));
    `;

    expect(requirements(source)).toEqual([
      expect.objectContaining({
        collection: "requests",
        equals: ["userId"],
        order: { field: "createdAt", direction: "DESCENDING" },
      }),
    ]);
  });

  it("follows constraints assembled into an array before the collection is named", () => {
    // shipments/getUserShipmentsPage.
    const source = `
      const constraints: QueryConstraint[] = [
        where("userId", "==", userId),
        orderBy("createdAt", "desc"),
        limit(pageSize),
      ];

      const q = query(
        collection(db, "shipments").withConverter(shipmentConverter),
        ...constraints
      );
    `;

    expect(requirements(source)).toEqual([
      expect.objectContaining({
        collection: "shipments",
        equals: ["userId"],
        order: { field: "createdAt", direction: "DESCENDING" },
      }),
    ]);
  });

  it("keeps each query with its own collection", () => {
    const source = `
      const a = query(
        collection(db, "requests"),
        where("userId", "==", userId),
        orderBy("createdAt", "desc")
      );
      const b = query(
        collection(db, "supportMessages"),
        where("ticketId", "==", ticketId),
        orderBy("createdAt", "asc")
      );
    `;

    expect(requirements(source)).toEqual([
      expect.objectContaining({
        collection: "requests",
        equals: ["userId"],
        order: { field: "createdAt", direction: "DESCENDING" },
      }),
      expect.objectContaining({
        collection: "supportMessages",
        equals: ["ticketId"],
        order: { field: "createdAt", direction: "ASCENDING" },
      }),
    ]);
  });

  it("treats a range as the ordering field", () => {
    const source = `
      const q = adminDb
        .collection("requests")
        .where("status", "==", "paid")
        .where("createdAt", ">=", since);
    `;

    expect(requirements(source)).toEqual([
      expect.objectContaining({
        collection: "requests",
        equals: ["status"],
        order: { field: "createdAt", direction: "ASCENDING" },
      }),
    ]);
  });

  it("ignores a query quoted in a comment", () => {
    const source = `
      /*
       * Only a literal orderBy(field, direction) can be checked.
       */
      const q = adminDb.collection("users").where("role", "==", "admin");
    `;

    const analysis = readQueries(source);

    expect(analysis.unverified).toEqual([]);
    expect(analysis.sites.flatMap((site) => requirementsFor(site))).toEqual([]);
  });

  it("reports a filter it cannot read instead of guessing", () => {
    const source = `const q = adminDb.collection("requests").where(sortField, "==", value);`;

    expect(readQueries(source).unverified).toEqual(["where(<dynamic field>)"]);
  });
});

describe("blankComments", () => {
  it("keeps offsets and leaves string contents alone", () => {
    const source = `const a = "https://example.test/x"; // trailing\nconst b = 1;`;
    const blanked = blankComments(source);

    expect(blanked).toHaveLength(source.length);
    expect(blanked).toContain("https://example.test/x");
    expect(blanked).not.toContain("trailing");
  });
});

describe("indexCovers", () => {
  const requirement = {
    collection: "requests",
    equals: ["userId"],
    order: { field: "createdAt", direction: "DESCENDING" },
  };

  const index = (
    fields: Array<{ fieldPath: string; order?: string }>,
    group = "requests"
  ) => ({
    collectionGroup: group,
    fields,
  });

  it("accepts the declared filter-then-order shape", () => {
    expect(
      indexCovers(
        requirement,
        index([
          { fieldPath: "userId", order: "ASCENDING" },
          { fieldPath: "createdAt", order: "DESCENDING" },
          { fieldPath: "__name__", order: "ASCENDING" },
        ])
      )
    ).toBe(true);
  });

  it("rejects the wrong direction, collection or field order", () => {
    expect(
      indexCovers(
        requirement,
        index([
          { fieldPath: "userId", order: "ASCENDING" },
          { fieldPath: "createdAt", order: "ASCENDING" },
        ])
      )
    ).toBe(false);
    expect(
      indexCovers(
        requirement,
        index(
          [
            { fieldPath: "userId", order: "ASCENDING" },
            { fieldPath: "createdAt", order: "DESCENDING" },
          ],
          "shipments"
        )
      )
    ).toBe(false);
    expect(
      indexCovers(
        requirement,
        index([
          { fieldPath: "createdAt", order: "DESCENDING" },
          { fieldPath: "userId", order: "ASCENDING" },
        ])
      )
    ).toBe(false);
  });
});
