// @vitest-environment happy-dom

/**
 * The redirect half of sign-in had no test.
 *
 * `LoginClient` signs in with Google through `signInWithRedirect` (the popup
 * flow hangs forever once the auth pages' Cross-Origin-Opener-Policy severs
 * the popup from the opener), and
 * hands the browser to Google. This component — mounted once, in the root
 * layout — is the only thing that picks the result up. The signed-in E2E types
 * credentials, so it exercises `signInWithEmailAndPassword` and never touches
 * this path.
 *
 * Two things break here when the code changes, and both are pinned below:
 *  - it must stay mounted exactly once, inside a `Suspense` boundary: it reads
 *    `useSearchParams`, which bails the whole render out of static generation
 *    without one, and a second mount would collect the same result twice;
 *  - a returned result must land on the right page — `/admin/dashboard` or the
 *    requested `next` for an admin, `/dashboard` for a customer, and still
 *    somewhere sane when the profile lookup itself fails.
 */

import { readFileSync } from "node:fs";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The setup file stubs this component so layout tests never hit Firebase; this
// file is the exception that renders the real one.
vi.unmock("@/components/AuthRedirectHandler");

const h = vi.hoisted(() => ({
  getRedirectResult: vi.fn(),
  currentUser: null as
    | {
        uid: string;
        displayName: string | null;
        email: string | null;
        photoURL: string | null;
      }
    | null,
  ensureUserProfile: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  searchParams: new URLSearchParams(),
  pathname: "/login",
  // One stable object: the component's effect depends on `router`, and a new
  // object per render would re-run the redirect check on every render.
  router: { replace: vi.fn(), refresh: vi.fn() },
}));

vi.mock("@/lib/firebase", () => ({
  auth: { name: "test-auth", get currentUser() {
    return h.currentUser;
  } },
}));

vi.mock("firebase/auth", () => ({
  getRedirectResult: (...args: unknown[]) => h.getRedirectResult(...args),
}));

vi.mock("sonner", () => ({
  toast: { success: h.success, error: h.error },
}));

vi.mock("@/features/users/services/userProfile", () => ({
  ensureUserProfile: (...args: unknown[]) => h.ensureUserProfile(...args),
}));

// The component's router and the assertions must be the same object: this
// file used to hand the component a local `mockRouter` while asserting on
// `h.router`, so three navigation tests could never pass. `next` was also
// hard-coded to null, which made the requested-page test prove nothing.
// `h` is hoisted, so the mock factory can read it.
vi.mock("next/navigation", () => ({
  useRouter: () => h.router,
  usePathname: () => h.pathname,
  useSearchParams: () => ({
    get: (key: string) => h.searchParams.get(key),
  }),
}));

import AuthRedirectHandler from "./AuthRedirectHandler";

function seedUser(displayName: string | null = "Ada") {
  return {
    user: {
      uid: "user-1",
      displayName,
      email: "ada@example.com",
      photoURL: null,
    },
  };
}

beforeEach(() => {
  h.currentUser = null;
  h.getRedirectResult.mockReset().mockResolvedValue(null);
  h.ensureUserProfile.mockReset().mockResolvedValue({ role: "customer" });
  h.success.mockReset();
  h.error.mockReset();
  h.router.replace.mockReset();
  h.router.refresh.mockReset();
  h.searchParams = new URLSearchParams();
  h.pathname = "/login";
  sessionStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AuthRedirectHandler", () => {
  it("is mounted once, inside a Suspense boundary in the root layout", () => {
    // `signInWithRedirect` hands the browser back to the URL it left from, which
    // can be any route, so the collector has to live in the root layout. It
    // reads `useSearchParams`, and without a `Suspense` parent that bails the
    // entire app out of static generation at build time.
    const source = (path: string) =>
      readFileSync(new URL(path, import.meta.url), "utf8");
    const layout = source("../app/layout.tsx");

    expect(layout).toMatch(
      /<Suspense[^>]*>[\s\S]*?<AuthRedirectHandler \/>[\s\S]*?<\/Suspense>/
    );
    // One mount: two collectors would race two `router.replace` calls.
    expect(layout.match(/<AuthRedirectHandler \/>/g)).toHaveLength(1);
    expect(source("../app/login/page.tsx")).not.toContain(
      "<AuthRedirectHandler />"
    );
  });

  it("hands `getRedirectResult` the shared auth instance", async () => {
    render(<AuthRedirectHandler />);

    await waitFor(() => expect(h.getRedirectResult).toHaveBeenCalled());
    // The auth instance comes from `@/lib/firebase`, not a second initialisation.
    expect(h.getRedirectResult).toHaveBeenCalledWith(
      expect.objectContaining({ name: "test-auth" })
    );
  });

  it("does nothing when the browser is not returning from a redirect", async () => {
    render(<AuthRedirectHandler />);

    await waitFor(() => expect(h.getRedirectResult).toHaveBeenCalled());

    expect(h.success).not.toHaveBeenCalled();
    expect(h.ensureUserProfile).not.toHaveBeenCalled();
    expect(h.router.replace).not.toHaveBeenCalled();
    expect(h.router.refresh).not.toHaveBeenCalled();
  });

  it("shows the signing-in interstitial while returning from a redirect", async () => {
    // The popup was blocked, so the button marked the trip before leaving.
    sessionStorage.setItem("shipin:auth-redirect-pending", "1");
    let resolveResult: (value: unknown) => void = () => {};
    h.getRedirectResult.mockReturnValue(new Promise((resolve) => {
      resolveResult = resolve;
    }));

    render(<AuthRedirectHandler />);

    // The interstitial covers the login form while the result is pending.
    expect(screen.getByRole("status")).toHaveTextContent(/signing you in/i);

    resolveResult(seedUser());
    await waitFor(() => expect(h.router.replace).toHaveBeenCalledWith("/dashboard"));
    // The flag is cleared once the result is in; the interstitial stays up
    // until the destination page replaces this one (pathname-driven).
    expect(sessionStorage.getItem("shipin:auth-redirect-pending")).toBeNull();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("drops the interstitial when no redirect result comes back", async () => {
    sessionStorage.setItem("shipin:auth-redirect-pending", "1");
    render(<AuthRedirectHandler />);

    expect(screen.getByRole("status")).toHaveTextContent(/signing you in/i);

    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument()
    );
    expect(sessionStorage.getItem("shipin:auth-redirect-pending")).toBeNull();
    expect(h.router.replace).not.toHaveBeenCalled();
  });

  it("repairs the profile, greets the user and lands on the dashboard", async () => {
    h.getRedirectResult.mockResolvedValue(seedUser("Ada"));
    h.ensureUserProfile.mockResolvedValue({ role: "customer" });

    render(<AuthRedirectHandler />);

    await waitFor(() =>
      expect(h.router.replace).toHaveBeenCalledWith("/dashboard")
    );

    // Redirect sign-in skips registration, so the profile has to be created
    // before navigating; without it every API call 403s.
    expect(h.ensureUserProfile).toHaveBeenCalledWith({
      uid: "user-1",
      displayName: "Ada",
      email: "ada@example.com",
      photoURL: null,
    });
    expect(h.success).toHaveBeenCalledWith("Welcome, Ada!");
    expect(h.router.refresh).toHaveBeenCalled();
  });

  it("sends an admin to the requested page and a customer away from it", async () => {
    h.searchParams = new URLSearchParams("next=%2Fadmin%2Frequests");
    h.getRedirectResult.mockResolvedValue(seedUser());
    h.ensureUserProfile.mockResolvedValue({ role: "admin" });

    const { unmount } = render(<AuthRedirectHandler />);
    await waitFor(() =>
      expect(h.router.replace).toHaveBeenCalledWith("/admin/requests")
    );
    unmount();

    // A customer who asked for an admin page must not be routed into it.
    h.router.replace.mockReset();
    h.ensureUserProfile.mockResolvedValue({ role: "customer" });

    render(<AuthRedirectHandler />);
    await waitFor(() =>
      expect(h.router.replace).toHaveBeenCalledWith("/dashboard")
    );
  });

  it("ignores a cross-origin next parameter", async () => {
    // %2F%5C decodes to a slash followed by a backslash: the bypass the old
    // startsWith guard accepted. A customer must land on the dashboard.
    h.searchParams = new URLSearchParams("next=%2F%5Cevil.com");
    h.getRedirectResult.mockResolvedValue(seedUser());
    h.ensureUserProfile.mockResolvedValue({ role: "customer" });

    render(<AuthRedirectHandler />);

    await waitFor(() =>
      expect(h.router.replace).toHaveBeenCalledWith("/dashboard")
    );
    expect(h.router.replace).not.toHaveBeenCalledWith(
      expect.stringContaining("evil.com")
    );
  });

  it("still navigates when the profile lookup fails", async () => {
    h.getRedirectResult.mockResolvedValue(seedUser());
    h.ensureUserProfile.mockRejectedValue(new Error("firestore unavailable"));

    render(<AuthRedirectHandler />);

    // The sign-in itself succeeded; failing to read the profile must not leave
    // the user stuck on a blank page after Google sent them back.
    await waitFor(() =>
      expect(h.router.replace).toHaveBeenCalledWith("/dashboard")
    );
    expect(console.error).toHaveBeenCalledWith(
      "Profile load failed:",
      expect.any(Error)
    );
  });

  it("ignores a no-result error and reports a real one", async () => {
    // Firebase reports "there was no redirect" as a rejection in some browsers.
    h.getRedirectResult.mockRejectedValue(
      Object.assign(new Error("no auth event"), { code: "auth/no-auth-event" })
    );

    const { unmount } = render(<AuthRedirectHandler />);
    await waitFor(() => expect(h.getRedirectResult).toHaveBeenCalled());
    expect(h.error).not.toHaveBeenCalled();
    unmount();

    h.getRedirectResult.mockRejectedValue(
      Object.assign(new Error("popup closed"), { code: "auth/internal-error" })
    );
    h.router.replace.mockReset();

    render(<AuthRedirectHandler />);

    await waitFor(() =>
      expect(h.error).toHaveBeenCalledWith(
        "Unable to complete sign-in. Please try again."
      )
    );
    expect(h.router.replace).not.toHaveBeenCalled();
  });

  it("routes normally when the result errors but a session already exists", async () => {
    // Observed in production: Identity Toolkit answered the sign-in (200) and
    // then 503'd the duplicate bookkeeping call, so `getRedirectResult` threw
    // `auth/error-code:-40` while `auth.currentUser` was already set. Telling
    // that user "sign-in failed" and stranding them on the login page is
    // wrong: the session is valid, so finish the normal routing.
    h.getRedirectResult.mockRejectedValue(
      Object.assign(new Error("bookkeeping failed"), {
        code: "auth/error-code:-40",
      })
    );
    h.currentUser = {
      uid: "user-1",
      displayName: "Ada",
      email: "ada@example.com",
      photoURL: null,
    };

    render(<AuthRedirectHandler />);

    await waitFor(() => expect(h.router.replace).toHaveBeenCalledWith("/dashboard"));
    expect(h.success).toHaveBeenCalledWith("Welcome, Ada!");
    expect(h.ensureUserProfile).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "user-1" })
    );
    expect(h.error).not.toHaveBeenCalled();
  });

  it("does not navigate after unmount when redirect result resolves later", async () => {
    // Component unmounts while getRedirectResult is still pending.
    // The effect's cleanup sets mounted = false, so resolving afterwards
    // must not call router.replace or router.refresh.
    const { unmount } = render(<AuthRedirectHandler />);

    // Unmount before the async resolution completes
    unmount();

    // Resolve getRedirectResult after unmount
    h.getRedirectResult.mockResolvedValue(seedUser("Ada"));
    h.ensureUserProfile.mockResolvedValue({ role: "customer" });

    // Navigate calls must be no-ops after unmount
    expect(h.router.replace).not.toHaveBeenCalled();
    expect(h.router.refresh).not.toHaveBeenCalled();
  });
});
