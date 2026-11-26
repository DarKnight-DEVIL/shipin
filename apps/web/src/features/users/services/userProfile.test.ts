import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  customerApi: vi.fn(),
}));

vi.mock("@/lib/customerApiClient", () => ({ customerApi: mocks.customerApi }));

import {
  clearUserProfileCache,
  createUserProfile,
  ensureUserProfile,
  getUserProfile,
  updateUserProfile,
} from "./userProfile";

const profile = (overrides: Record<string, unknown> = {}) => ({
  displayName: "Ada",
  email: "ada@example.com",
  phone: "+44",
  ...overrides,
});

beforeEach(() => {
  clearUserProfileCache();
  mocks.customerApi.mockReset();
  mocks.customerApi.mockResolvedValue({ success: true });
});

describe("getUserProfile", () => {
  it("reads the safe projection from the API", async () => {
    mocks.customerApi.mockResolvedValue({ profile: profile() });

    await expect(getUserProfile("user-1")).resolves.toEqual(profile());
    expect(mocks.customerApi).toHaveBeenCalledWith("/api/profile");
  });

  it("returns null when no profile exists", async () => {
    mocks.customerApi.mockResolvedValue({ profile: null });

    await expect(getUserProfile("missing")).resolves.toBeNull();
  });

  it("wraps API failures", async () => {
    mocks.customerApi.mockRejectedValue(new Error("offline"));

    await expect(getUserProfile("user-1")).rejects.toBeInstanceOf(Error);
  });
});

describe("createUserProfile", () => {
  it("creates the profile through the customer API", async () => {
    await createUserProfile("user-1", {
      displayName: "Ada",
      email: "ada@example.com",
      phone: "+44",
      photoURL: "https://img/ada.png",
    });

    expect(mocks.customerApi).toHaveBeenCalledWith("/api/profile", {
      method: "POST",
      body: {
        displayName: "Ada",
        email: "ada@example.com",
        phone: "+44",
        photoURL: "https://img/ada.png",
      },
    });
  });

  it("sends empty strings for optional fields", async () => {
    await createUserProfile("user-1", {
      displayName: "Ada",
      email: "ada@example.com",
    });

    expect(mocks.customerApi).toHaveBeenCalledWith(
      "/api/profile",
      expect.objectContaining({
        body: {
          displayName: "Ada",
          email: "ada@example.com",
          phone: "",
          photoURL: "",
        },
      })
    );
  });

  it("wraps API failures", async () => {
    mocks.customerApi.mockRejectedValue(new Error("permission-denied"));

    await expect(
      createUserProfile("user-1", { displayName: "A", email: "a@b.c" })
    ).rejects.toMatchObject({ name: "AuthorizationError" });
  });
});

describe("ensureUserProfile", () => {
  it("keeps an existing profile and does not write", async () => {
    mocks.customerApi.mockResolvedValue({
      profile: profile({ role: "customer" }),
    });

    const result = await ensureUserProfile({
      uid: "user-1",
      displayName: "Ada",
      email: "ada@example.com",
    });

    expect(result).toMatchObject({ displayName: "Ada", role: "customer" });
    expect(mocks.customerApi).toHaveBeenCalledTimes(1);
    expect(mocks.customerApi).toHaveBeenCalledWith("/api/profile");
  });

  it("creates the missing profile for a Google account", async () => {
    mocks.customerApi
      .mockResolvedValueOnce({ profile: null })
      .mockResolvedValueOnce({ success: true });

    const result = await ensureUserProfile({
      uid: "google-1",
      displayName: "Ada Lovelace",
      email: "ada@example.com",
      photoURL: "https://img/ada.png",
    });

    expect(mocks.customerApi).toHaveBeenCalledWith("/api/profile", {
      method: "POST",
      body: {
        displayName: "Ada Lovelace",
        email: "ada@example.com",
        phone: "",
        photoURL: "https://img/ada.png",
      },
    });
    expect(result).toMatchObject({
      displayName: "Ada Lovelace",
      email: "ada@example.com",
      photoURL: "https://img/ada.png",
    });
  });

  it("derives a display name from the email when Firebase has none", async () => {
    mocks.customerApi
      .mockResolvedValueOnce({ profile: null })
      .mockResolvedValueOnce({ success: true });

    await ensureUserProfile({
      uid: "user-2",
      displayName: null,
      email: "ada@example.com",
    });

    expect(mocks.customerApi).toHaveBeenCalledWith(
      "/api/profile",
      expect.objectContaining({
        body: expect.objectContaining({ displayName: "ada" }),
      })
    );
  });

  it("falls back to a generic name when the account has no name or email", async () => {
    mocks.customerApi
      .mockResolvedValueOnce({ profile: null })
      .mockResolvedValueOnce({ success: true });

    await ensureUserProfile({ uid: "user-3" });

    expect(mocks.customerApi).toHaveBeenCalledWith(
      "/api/profile",
      expect.objectContaining({
        body: expect.objectContaining({ displayName: "ShipIN customer" }),
      })
    );
  });

  it("shares one read between the sign-in flow and the layout that follows", async () => {
    mocks.customerApi.mockResolvedValue({
      profile: profile({ role: "admin" }),
    });

    const [atSignIn, atLayout] = await Promise.all([
      ensureUserProfile({ uid: "user-1", email: "ada@example.com" }),
      ensureUserProfile({ uid: "user-1", email: "ada@example.com" }),
    ]);

    expect(mocks.customerApi).toHaveBeenCalledTimes(1);
    expect(atSignIn).toBe(atLayout);
    expect(atSignIn).toMatchObject({ role: "admin" });
  });

  it("keeps the cache per account", async () => {
    mocks.customerApi.mockResolvedValue({ profile: null });

    await ensureUserProfile({ uid: "user-a" });
    await ensureUserProfile({ uid: "user-b" });

    expect(mocks.customerApi).toHaveBeenCalledTimes(4);
  });

  it("does not cache a repair that failed, so the next caller retries", async () => {
    mocks.customerApi
      .mockResolvedValueOnce({ profile: null })
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ profile: null })
      .mockResolvedValueOnce({ success: true });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      ensureUserProfile({ uid: "user-5", email: "a@b.co" })
    ).resolves.toBeNull();

    const retried = await ensureUserProfile({ uid: "user-5", email: "a@b.co" });

    expect(retried).toMatchObject({ email: "a@b.co" });
    expect(mocks.customerApi).toHaveBeenCalledTimes(4);

    errorSpy.mockRestore();
  });

  it("does not cache a rejected read", async () => {
    mocks.customerApi
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ profile: profile() });

    await expect(ensureUserProfile({ uid: "user-6" })).rejects.toThrow(
      "offline"
    );

    await expect(ensureUserProfile({ uid: "user-6" })).resolves.toMatchObject({
      displayName: "Ada",
    });
  });

  it("returns null instead of throwing when the repair fails", async () => {
    mocks.customerApi
      .mockResolvedValueOnce({ profile: null })
      .mockRejectedValueOnce(new Error("network down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      ensureUserProfile({ uid: "user-4", email: "a@b.co" })
    ).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});

describe("updateUserProfile", () => {
  it("drops the cached repair result so the next reader sees the edit", async () => {
    mocks.customerApi.mockResolvedValue({ profile: profile() });

    await ensureUserProfile({ uid: "user-7", email: "ada@example.com" });
    await updateUserProfile("user-7", { displayName: "Ada Lovelace" });
    await ensureUserProfile({ uid: "user-7", email: "ada@example.com" });

    expect(mocks.customerApi).toHaveBeenCalledTimes(3);
  });

  it("patches only the supplied fields", async () => {
    await updateUserProfile("user-1", { displayName: "Ada Lovelace" });

    expect(mocks.customerApi).toHaveBeenCalledWith("/api/profile", {
      method: "PATCH",
      body: { displayName: "Ada Lovelace" },
    });
  });

  it("wraps API failures", async () => {
    mocks.customerApi.mockRejectedValue(new Error("boom"));

    await expect(
      updateUserProfile("user-1", { phone: "+1" })
    ).rejects.toBeInstanceOf(Error);
  });
});
