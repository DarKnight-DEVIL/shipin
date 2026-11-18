// @vitest-environment happy-dom

/**
 * Admin sign-out.
 *
 * The elevation cookie outlives `signOut(auth)` on its own, so a logout that
 * only clears Firebase leaves the account able to walk back into /admin without
 * a fresh MFA challenge for the rest of the 30-minute window. The ordering is
 * the requirement: the DELETE needs the ID token, so it has to run *before*
 * sign-out takes that token away.
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  signOut: vi.fn(),
  endMfaSession: vi.fn(),
  getIdToken: vi.fn(),
  currentUser: null as null | { getIdToken: () => Promise<string> },
  replace: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({
  get auth() {
    return { currentUser: h.currentUser };
  },
}));

vi.mock("firebase/auth", () => ({
  signOut: (...args: unknown[]) => h.signOut(...args),
}));

vi.mock("@/lib/mfaSessionClient", () => ({
  endMfaSession: (...args: unknown[]) => h.endMfaSession(...args),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/dashboard",
  useRouter: () => ({ replace: h.replace }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: unknown; children: unknown }) =>
    React.createElement(
      "a",
      { href: String(href) },
      children as React.ReactNode
    ),
}));

vi.mock("@/components/ui", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  AppCheckBanner: () => null,
  RetryNotice: () => null,
}));

vi.mock("./AdminGuard", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/admin/AdminMfaGate", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import AdminLayout from "./layout";

beforeEach(() => {
  h.signOut.mockReset().mockResolvedValue(undefined);
  h.endMfaSession.mockReset().mockResolvedValue(undefined);
  h.getIdToken.mockReset().mockResolvedValue("token-1");
  h.replace.mockReset();
  h.currentUser = { getIdToken: () => h.getIdToken() };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AdminLayout: sign-out", () => {
  it("ends the MFA elevation before signing out", async () => {
    render(
      <AdminLayout>
        <p>admin content</p>
      </AdminLayout>
    );

    fireEvent.click(screen.getByRole("button", { name: /log ?out/i }));

    await waitFor(() => expect(h.signOut).toHaveBeenCalledTimes(1));

    expect(h.endMfaSession).toHaveBeenCalledWith("token-1");
    // Ordering is the whole point: after signOut the token is gone.
    expect(h.endMfaSession.mock.invocationCallOrder[0]).toBeLessThan(
      h.signOut.mock.invocationCallOrder[0]
    );
  });

  it("still signs out when the elevation cannot be ended", async () => {
    h.endMfaSession.mockRejectedValue(new Error("network down"));

    render(
      <AdminLayout>
        <p>admin content</p>
      </AdminLayout>
    );

    fireEvent.click(screen.getByRole("button", { name: /log ?out/i }));

    // A stuck sign-out would leave the admin with no way out at all.
    await waitFor(() => expect(h.signOut).toHaveBeenCalledTimes(1));
  });

  it("signs out without an elevation call when there is no session", async () => {
    h.currentUser = null;

    render(
      <AdminLayout>
        <p>admin content</p>
      </AdminLayout>
    );

    fireEvent.click(screen.getByRole("button", { name: /log ?out/i }));

    await waitFor(() => expect(h.signOut).toHaveBeenCalledTimes(1));
    expect(h.endMfaSession).not.toHaveBeenCalled();
  });
});
