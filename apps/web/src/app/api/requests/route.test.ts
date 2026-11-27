import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  addressGet: vi.fn(),
  profileGet: vi.fn(),
  add: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuthWithProfile: mocks.requireAuthWithProfile,
}));

const collections = vi.hoisted(
  () => ({}) as Record<string, { doc: unknown; add: unknown }>
);

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: {
    collection: (name: string) => collections[name],
  },
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__SERVER_TS__" },
}));

import { POST } from "./route";

const addresses = (data: Record<string, unknown> | undefined) => {
  collections["addresses"] = {
    doc: () => ({
      get: mocks.addressGet.mockResolvedValue({
        exists: data !== undefined,
        data: () => data,
      }),
    }),
    add: mocks.add,
  };
};

const users = (data: Record<string, unknown> | undefined) => {
  collections["users"] = {
    doc: () => ({
      get: mocks.profileGet.mockResolvedValue({
        exists: data !== undefined,
        data: () => data,
      }),
    }),
    add: mocks.add,
  };
};

const requests = () => {
  collections["requests"] = { doc: vi.fn(), add: mocks.add };
};

const body = {
  items: [{ name: "Cable", url: "https://shop/cable", quantity: 2 }],
  addressId: "addr-1",
  serviceSelections: { inspection: "standard", shippingPreference: "approval" },
  notes: "handle with care",
};

const post = (payload: unknown = body) =>
  new NextRequest("http://localhost/api/requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });

const address = {
  userId: "user-1",
  recipientName: "Test User",
  line1: "1 Road",
  city: "Mumbai",
};

beforeEach(() => {
  mocks.requireAuthWithProfile.mockReset().mockResolvedValue({
    token: { uid: "user-1", email: "user@example.com" },
    profile: { uid: "user-1", role: "customer" },
  });
  mocks.addressGet.mockReset();
  mocks.profileGet.mockReset();
  mocks.add.mockReset().mockResolvedValue({ id: "req-new" });
  addresses(address);
  users({
    displayName: "Test User",
    email: "profile@example.com",
    // The age gate refuses accounts with no DOB on file, so every
    // success-path fixture is an adult.
    dateOfBirth: "1990-01-01",
  });
  requests();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/requests", () => {
  it("creates a submitted request owned by the caller", async () => {
    const response = await POST(post());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      success: true,
      requestId: "req-new",
    });

    const created = mocks.add.mock.calls[0][0];
    expect(created).toMatchObject({
      userId: "user-1",
      email: "user@example.com",
      customerName: "Test User",
      status: "submitted",
      schemaVersion: 1,
      notes: "handle with care",
      serviceSelections: {
        inspection: "standard",
        shippingPreference: "approval",
      },
      items: [{ name: "Cable", url: "https://shop/cable", quantity: 2 }],
      statusHistory: { submitted: "__SERVER_TS__" },
      createdAt: "__SERVER_TS__",
      updatedAt: "__SERVER_TS__",
    });
    // The address is snapshotted from the caller's own address book.
    expect(created.shippingAddress).toMatchObject({ line1: "1 Road" });
  });

  it("rejects unauthenticated callers", async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ success: false }, { status: 401 })
    );

    const response = await POST(post());

    expect(response.status).toBe(401);
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("blocks an under-18 account without parental consent", async () => {
    users({ displayName: "Kid", dateOfBirth: "2015-06-01" });

    const response = await POST(post());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "AGE_GATE_BLOCKED",
      error: "Users under 18 require verified parental consent per DPDP Act 2023",
    });
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("blocks an account with no date of birth on file", async () => {
    users({ displayName: "No Dob" });

    const response = await POST(post());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "DOB_REQUIRED",
      error: "Add your date of birth to your profile before placing a request.",
    });
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("enforces the SKU cap", async () => {
    const response = await POST(
      post({
        ...body,
        items: [1, 2, 3, 4].map((n) => ({
          name: `Item ${n}`,
          url: `https://shop/${n}`,
          quantity: 1,
        })),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "INVALID_REQUEST_BODY",
      error: "A request can include up to 3 products.",
    });
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("rejects an empty item list", async () => {
    const response = await POST(post({ ...body, items: [] }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Add at least one product.",
    });
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("answers 404 for a missing address", async () => {
    addresses(undefined);

    const response = await POST(post());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "Address not found.",
    });
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("answers 404 for another customer's address", async () => {
    addresses({ ...address, userId: "user-2" });

    const response = await POST(post());

    expect(response.status).toBe(404);
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("rejects a malformed body", async () => {
    const response = await POST(post({ items: "three" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_REQUEST_BODY",
    });
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("rejects an unreadable body", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/requests", {
        method: "POST",
        body: "{nope",
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("falls back to the profile email when the token has none", async () => {
    mocks.requireAuthWithProfile.mockResolvedValue({
      token: { uid: "user-1" },
      profile: { uid: "user-1", role: "customer" },
    });

    await POST(post());

    expect(mocks.add.mock.calls[0][0].email).toBe("profile@example.com");
  });

  it("defaults the service selections when the body omits them", async () => {
    const { serviceSelections: _omitted, ...withoutServices } = body;

    await POST(post(withoutServices));

    expect(mocks.add.mock.calls[0][0].serviceSelections).toEqual({
      inspection: "standard",
      shippingPreference: "approval",
    });
  });
});
