// @vitest-environment happy-dom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  onAuthStateChanged: vi.fn(),
  subscribeToNotifications: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: mocks.onAuthStateChanged,
}));

vi.mock("@/lib/firebase", () => ({
  auth: { currentUser: null },
}));

vi.mock("@/features/notifications/client", () => ({
  subscribeToNotifications: mocks.subscribeToNotifications,
}));

import { useUnreadNotifications } from "./useUnreadNotifications";

beforeEach(() => {
  mocks.onAuthStateChanged.mockReset();
  mocks.subscribeToNotifications.mockReset().mockReturnValue(vi.fn());
});

describe("useUnreadNotifications", () => {
  it("subscribes once Firebase restores a session after a cold load", async () => {
    mocks.onAuthStateChanged.mockImplementation(
      (_auth: unknown, callback: (user: { uid: string } | null) => void) => {
        // Firebase reports "no user yet" first, then the restored session.
        callback(null);
        callback({ uid: "user-1" });
        return vi.fn();
      }
    );

    mocks.subscribeToNotifications.mockImplementation(
      (_uid: string, callback: (items: unknown[]) => void) => {
        callback([{ id: "n-1", read: false }, { id: "n-2", read: true }]);
        return vi.fn();
      }
    );

    const { result } = renderHook(() => useUnreadNotifications());

    await waitFor(() => expect(result.current).toBe(1));
    expect(mocks.subscribeToNotifications).toHaveBeenCalledWith(
      "user-1",
      expect.any(Function)
    );
  });

  it("tears the feed subscription down when the user signs out", async () => {
    const unsubscribeFeed = vi.fn();
    let authCallback: ((user: { uid: string } | null) => void) | undefined;

    mocks.onAuthStateChanged.mockImplementation(
      (_auth: unknown, callback: (user: { uid: string } | null) => void) => {
        authCallback = callback;
        callback({ uid: "user-1" });
        return vi.fn();
      }
    );
    mocks.subscribeToNotifications.mockReturnValue(unsubscribeFeed);

    const { result } = renderHook(() => useUnreadNotifications());

    await waitFor(() =>
      expect(mocks.subscribeToNotifications).toHaveBeenCalled()
    );

    authCallback?.(null);

    await waitFor(() => expect(result.current).toBe(0));
    expect(unsubscribeFeed).toHaveBeenCalled();
  });
});
