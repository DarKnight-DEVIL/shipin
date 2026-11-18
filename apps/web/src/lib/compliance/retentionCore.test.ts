/**
 * Retention policy helpers: legal holds, deletion eligibility and the
 * collections that back each personal-data category.
 */
import { describe, it, expect } from "vitest";

import {
  hasLegalHold,
  shouldHardDelete,
  getCollectionsForCategory,
} from "./retentionCore";

describe("compliance retention helpers (pure)", () => {
  it("getCollectionsForCategory returns the documented map", () => {
    expect(getCollectionsForCategory("account")).toEqual(["users"]);
    expect(getCollectionsForCategory("payment")).toEqual([
      "walletTransactions",
      "paypalPaymentOrders",
      "requests",
    ]);
    expect(getCollectionsForCategory("marketing")).toEqual(["users"]);
    expect(getCollectionsForCategory("unknown")).toEqual([]);
  });

  it("hasLegalHold recognises the documented hold flags", () => {
    expect(hasLegalHold("account", { legalHold: true })).toBe(true);
    expect(hasLegalHold("account", { litigationHold: true })).toBe(true);
    expect(hasLegalHold("account", { auditHold: true })).toBe(true);
    expect(hasLegalHold("account", {})).toBe(false);
    expect(hasLegalHold("account", { legalHold: false })).toBe(false);
  });

  it("shouldHardDelete lists the documented hard-delete categories", () => {
    expect(shouldHardDelete("analytics")).toBe(true);
    expect(shouldHardDelete("marketing")).toBe(true);
    expect(shouldHardDelete("cookie")).toBe(true);
    expect(shouldHardDelete("auth")).toBe(true);
    expect(shouldHardDelete("shipping")).toBe(false);
    expect(shouldHardDelete("account")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Firestore-backed compliance modules (with stubs)
// ---------------------------------------------------------------------------
