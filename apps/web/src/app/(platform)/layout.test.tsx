// @vitest-environment happy-dom

/**
 * Tests for the platform layout's auth gate.
 *
 * Three behaviours matter here and none of them are covered anywhere else:
 *
 *   - a signed-out visitor sees the page immediately (no gate, no repair);
 *   - a signed-in user sees the loading skeleton until the profile repair
 *     settles, so a page cannot fire its first API call into a 403;
 *   - the repair is requested once per account per tab, even though the effect
 *     re-subscribes on every navigation.
 *
 * The repair itself is NOT mocked: the layout imports the real
 * `ensureUserProfile`, and only Firestore and the API client underneath it are
 * stubbed. That is what makes the "once" assertion meaningful — the cache under
 * test is the real one. `vi.resetModules()` per test gives every test a fresh
 * service module (and therefore an empty cache), while the already-imported
 * React and layout keep their bindings.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

const state = vi.hoisted(() => ({
  pathname: "/dashboard",
  replace: vi.fn(),
  currentUser: null as { uid: string } | null,
  authCallback: null as null | ((user: unknown) => Promise<void> | void),
  unsubscribe: vi.fn(),
  getDoc: vi.fn(),
  customerApi: vi.fn(),
}));

// Stable object identity: the layout's effect depends on `router`, so a new
// object per render would re-subscribe forever.
const router = { replace: state.replace, refresh: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => state.pathname,
}));

vi.mock("@/lib/firebase", () => ({
  get auth() {
    return {
      get currentUser() {
        return state.currentUser;
      },
      onAuthStateChanged: (callback: (user: unknown) => Promise<void> | void) => {
        state.authCallback = callback;
        return state.unsubscribe;
      },
    };
  },
}));

// The repair reads Firestore directly, then POSTs /api/profile when the
// document is missing.
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, collection: string, id: string) => ({
    path: `${collection}/${id}`,
  }),
  getDoc: state.getDoc,
}));
vi.mock("@/lib/firebaseDb", () => ({ db: {} }));
vi.mock("@/lib/customerApiClient", () => ({ customerApi: state.customerApi }));

vi.mock("@/components/platform/PlatformShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="shell">{children}</div>
  ),
}));

vi.mock("@/components/ui", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AppCheckBanner: () => null,
  RetryNotice: () => null,
}));

vi.mock("./loading", () => ({
  default: () => <div data-testid="loading">loading</div>,
}));

vi.mock("@/lib/axeScan", () => ({ useAxeScan: () => {} }));

import PlatformLayout from "./layout";

const page = <div data-testid="page">dashboard</div>;

const signedInUser = (overrides: Record<string, unknown> = {}) => ({
  uid: "user-1",
  email: "ada@example.com",
  displayName: "Ada Lovelace",
  emailVerified: true,
  photoURL: "https://img/ada.png",
  ...overrides,
});

const existingProfile = {
  exists: () => true,
  data: () => ({ displayName: "Ada", email: "ada@example.com", phone: "" }),
};

/** Deliver an auth-state change and let React flush it. */
async function emitAuth(user: unknown) {
  await act(async () => {
    await state.authCallback?.(user);
  });
}

beforeEach(() => {
  vi.resetModules();
  state.pathname = "/dashboard";
  state.currentUser = null;
  state.authCallback = null;
  state.replace.mockReset();
  state.unsubscribe.mockReset();
  state.getDoc.mockReset().mockResolvedValue(existingProfile);
  state.customerApi.mockReset().mockResolvedValue({ success: true });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PlatformLayout: signed out", () => {
  it("renders the page without gating or repairing", async () => {
    render(<PlatformLayout>{page}</PlatformLayout>);

    await emitAuth(null);

    expect(screen.getByTestId("page")).toBeTruthy();
    expect(screen.queryByTestId("loading")).toBeNull();
    expect(state.getDoc).not.toHaveBeenCalled();
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("drops back to the page when the session ends", async () => {
    render(<PlatformLayout>{page}</PlatformLayout>);

    await emitAuth(signedInUser());
    await waitFor(() => expect(screen.getByTestId("page")).toBeTruthy());

    await emitAuth(null);

    expect(screen.getByTestId("page")).toBeTruthy();
    expect(screen.queryByTestId("loading")).toBeNull();
  });
});

describe("PlatformLayout: signed in", () => {
  it("holds the page behind the loading skeleton until the repair settles", async () => {
    // Own the promise so no other test can overwrite getDoc's behaviour
    // while React is waiting for the profile document.
    let resolveProfile!: (value: unknown) => void;
    const profilePromise = new Promise<unknown>((resolve) => {
      resolveProfile = resolve;
    });
    state.getDoc.mockImplementation(() => profilePromise);

    render(<PlatformLayout>{page}</PlatformLayout>);

    // A page rendering now would fire its first API call into a 403
    // USER_PROFILE_NOT_FOUND, which is the bug this gate exists to prevent.
    act(() => {
      void state.authCallback?.(signedInUser());
    });

    await waitFor(() => expect(screen.getByTestId("loading")).toBeTruthy());
    expect(screen.queryByTestId("page")).toBeNull();

    await act(async () => {
      resolveProfile(existingProfile);
    });

    await waitFor(() => expect(screen.getByTestId("page")).toBeTruthy());
    expect(screen.queryByTestId("loading")).toBeNull();
  });

  it("repairs the signed-in account with its identity", async () => {
    render(<PlatformLayout>{page}</PlatformLayout>);

    await emitAuth(signedInUser());
    await waitFor(() => expect(screen.getByTestId("page")).toBeTruthy());

    expect(state.getDoc).toHaveBeenCalledTimes(1);
    expect(state.getDoc.mock.calls[0][0]).toEqual({ path: "users/user-1" });
    expect(state.customerApi).not.toHaveBeenCalled();
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("still renders the page when the repair fails", async () => {
    state.getDoc.mockRejectedValue(new Error("offline"));

    render(<PlatformLayout>{page}</PlatformLayout>);

    await emitAuth(signedInUser());

    await waitFor(() => expect(screen.getByTestId("page")).toBeTruthy());
  });

  it("repairs once per account even though navigation re-subscribes", async () => {
    const { rerender } = render(<PlatformLayout>{page}</PlatformLayout>);

    await emitAuth(signedInUser());
    await waitFor(() => expect(screen.getByTestId("page")).toBeTruthy());
    expect(state.getDoc).toHaveBeenCalledTimes(1);

    // Navigate: the effect depends on pathname, so it unsubscribes, subscribes
    // again, and fires the repair a second time. The service cache is what
    // keeps it at one Firestore read.
    state.pathname = "/wallet";
    rerender(<PlatformLayout>{page}</PlatformLayout>);
    expect(state.unsubscribe).toHaveBeenCalledTimes(1);

    await emitAuth(signedInUser());
    await waitFor(() => expect(screen.getByTestId("page")).toBeTruthy());

    expect(state.getDoc).toHaveBeenCalledTimes(1);
  });
});

describe("PlatformLayout: email verification", () => {
  it("redirects an unverified user to the verification page", async () => {
    render(<PlatformLayout>{page}</PlatformLayout>);

    await emitAuth(signedInUser({ emailVerified: false }));

    expect(state.replace).toHaveBeenCalledWith("/verify-email");
  });

  it("does not redirect while already on the verification page", async () => {
    state.pathname = "/verify-email";

    render(<PlatformLayout>{page}</PlatformLayout>);

    await emitAuth(signedInUser({ emailVerified: false }));

    expect(state.replace).not.toHaveBeenCalled();
  });
});
