// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { FormEvent } from "react";

const mocks = vi.hoisted(() => ({
  changePassword: vi.fn(),
}));

vi.mock("@/lib/customerApiClient", () => ({
  customerApi: mocks.changePassword,
}));

import { usePasswordSettings } from "./usePasswordSettings";

const event = () => ({ preventDefault: vi.fn() }) as unknown as FormEvent;

beforeEach(() => {
  mocks.changePassword.mockReset().mockResolvedValue({ success: true });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function fill(
  result: { current: ReturnType<typeof usePasswordSettings> },
  values: { current?: string; next?: string; confirm?: string }
) {
  await act(async () => {
    if (values.current !== undefined)
      result.current.setCurrentPassword(values.current);
    if (values.next !== undefined) result.current.setNewPassword(values.next);
    if (values.confirm !== undefined)
      result.current.setConfirmPassword(values.confirm);
  });
}

describe("usePasswordSettings — validation", () => {
  it("requires the current password for an account that has one", async () => {
    const { result } = renderHook(() => usePasswordSettings(true));

    await fill(result, { next: "newpass1", confirm: "newpass1" });
    await act(async () => {
      await result.current.submit(event());
    });

    expect(result.current.error).toBe("Enter your current password.");
    expect(mocks.changePassword).not.toHaveBeenCalled();
  });

  it("applies the shared password policy", async () => {
    const { result } = renderHook(() => usePasswordSettings(true));

    await fill(result, {
      current: "oldpass1",
      next: "short",
      confirm: "short",
    });
    await act(async () => {
      await result.current.submit(event());
    });

    expect(result.current.error).toBe("Use at least 8 characters.");
  });

  it("rejects reusing the current password", async () => {
    const { result } = renderHook(() => usePasswordSettings(true));

    await fill(result, {
      current: "samepass1",
      next: "samepass1",
      confirm: "samepass1",
    });
    await act(async () => {
      await result.current.submit(event());
    });

    expect(result.current.error).toBe("New password must be different.");
  });

  it("requires matching confirmation", async () => {
    const { result } = renderHook(() => usePasswordSettings(true));

    await fill(result, {
      current: "oldpass1",
      next: "newpass1",
      confirm: "otherpass1",
    });
    await act(async () => {
      await result.current.submit(event());
    });

    expect(result.current.error).toBe("New passwords don't match.");
  });
});

describe("usePasswordSettings — submission", () => {
  it("changes the password through the server route, never the client SDK", async () => {
    const { result } = renderHook(() => usePasswordSettings(true));

    await fill(result, {
      current: "oldpass1",
      next: "newpass1",
      confirm: "newpass1",
    });
    await act(async () => {
      await result.current.submit(event());
    });

    expect(mocks.changePassword).toHaveBeenCalledWith("/api/user/password", {
      method: "POST",
      body: { currentPassword: "oldpass1", newPassword: "newpass1" },
    });
    expect(result.current.message).toBe("Password updated.");
    expect(result.current.currentPassword).toBe("");
    expect(result.current.newPassword).toBe("");
    expect(result.current.confirmPassword).toBe("");
    expect(result.current.changing).toBe(false);
  });

  it("sets a first password for a social-only account without asking for one", async () => {
    const { result } = renderHook(() => usePasswordSettings(false));

    await fill(result, { next: "newpass1", confirm: "newpass1" });
    await act(async () => {
      await result.current.submit(event());
    });

    expect(mocks.changePassword).toHaveBeenCalledWith("/api/user/password", {
      method: "POST",
      body: { currentPassword: undefined, newPassword: "newpass1" },
    });
  });

  it("surfaces the server message when the password is rejected", async () => {
    mocks.changePassword.mockRejectedValue(
      new Error("Your current password is incorrect.")
    );
    const { result } = renderHook(() => usePasswordSettings(true));

    await fill(result, {
      current: "oldpass1",
      next: "newpass1",
      confirm: "newpass1",
    });
    await act(async () => {
      await result.current.submit(event());
    });

    expect(result.current.error).toBe("Your current password is incorrect.");
    expect(result.current.changing).toBe(false);
  });

  it("falls back to a generic message for non-Error rejections", async () => {
    mocks.changePassword.mockRejectedValue("nope");
    const { result } = renderHook(() => usePasswordSettings(true));

    await fill(result, {
      current: "oldpass1",
      next: "newpass1",
      confirm: "newpass1",
    });
    await act(async () => {
      await result.current.submit(event());
    });

    expect(result.current.error).toBe("Failed to update password.");
  });

  it("clears stale messages on the next attempt", async () => {
    const { result } = renderHook(() => usePasswordSettings(true));

    await fill(result, {
      current: "oldpass1",
      next: "newpass1",
      confirm: "newpass1",
    });
    await act(async () => {
      await result.current.submit(event());
    });
    expect(result.current.message).toBe("Password updated.");

    await fill(result, { current: "", next: "", confirm: "" });
    await act(async () => {
      await result.current.submit(event());
    });

    expect(result.current.message).toBe("");
    expect(result.current.error).toBe("Enter your current password.");
  });
});
