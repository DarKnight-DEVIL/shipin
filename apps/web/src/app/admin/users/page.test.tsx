// @vitest-environment happy-dom

/**
 * The verify-email action on /admin/users.
 *
 * This button bypasses a security control, so the behaviour worth pinning is that it
 * refuses to act without a reason, sends that reason, and never claims success on an
 * account that was already verified elsewhere.
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  customerApi: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({ auth: {} }));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (...args: unknown[]) => h.onAuthStateChanged(...args),
}));

vi.mock("@/lib/customerApiClient", () => ({
  customerApi: (...args: unknown[]) => h.customerApi(...args),
  CustomerApiError: class CustomerApiError extends Error {},
}));

import { CustomerApiError } from "@/lib/customerApiClient";

import AdminUsersPage from "./page";

const rows = [
  {
    uid: "u-unverified",
    email: "new@example.com",
    displayName: "New Customer",
    role: "customer",
    mfaEnabled: false,
    emailVerified: false,
    createdAt: 2_000,
  },
  {
    uid: "u-verified",
    email: "ok@example.com",
    displayName: "Verified Customer",
    role: "customer",
    mfaEnabled: false,
    emailVerified: true,
    createdAt: 1_000,
  },
];

/** The list request is a GET; everything else is the action under test. */
function routeApi(method: string | undefined) {
  if (method === "GET" || method === undefined) {
    return Promise.resolve({ users: rows, nextCursor: null, hasMore: false });
  }

  return Promise.resolve({ success: true });
}

beforeEach(() => {
  h.customerApi.mockReset().mockImplementation((_url, init) =>
    routeApi((init as { method?: string } | undefined)?.method)
  );
  // Mirrors Firebase: the listener fires immediately, which is what loads the list.
  h.onAuthStateChanged.mockReset().mockImplementation(
    (_auth: unknown, callback: () => void) => {
      void callback();
      return () => {};
    }
  );
});

describe("AdminUsersPage: verify email", () => {
  it("only offers the action for an unverified account", async () => {
    render(<AdminUsersPage />);

    const buttons = await screen.findAllByRole("button", {
      name: /verify email/i,
    });

    // One button, for the unverified row; the verified account does not get one.
    expect(buttons).toHaveLength(1);
    expect(screen.getByText("Email unverified")).toBeTruthy();
  });

  it("requires a reason before it will send anything", async () => {
    render(<AdminUsersPage />);

    fireEvent.click(
      (await screen.findAllByRole("button", { name: /verify email/i }))[0]
    );

    const confirm = screen.getByRole("button", { name: /^confirm$/i });
    // The server rejects a call without a reason; the button must not invite one.
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/reason/i), {
      target: { value: "lo" },
    });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/reason/i), {
      target: { value: "customer lost mailbox access" },
    });
    expect(confirm).not.toBeDisabled();
  });

  it("sends the reason and shows the account as verified", async () => {
    render(<AdminUsersPage />);

    fireEvent.click(
      (await screen.findAllByRole("button", { name: /verify email/i }))[0]
    );
    fireEvent.change(screen.getByLabelText(/reason/i), {
      target: { value: "customer lost mailbox access" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));

    await waitFor(() =>
      expect(h.customerApi).toHaveBeenCalledWith(
        "/api/admin/users/u-unverified/verify-email",
        {
          method: "POST",
          body: { reason: "customer lost mailbox access" },
        }
      )
    );

    // The operator is told the customer still has to re-authenticate, because the
    // cached token keeps the old claim for up to an hour.
    expect(
      await screen.findByText(/must sign out and back in/i)
    ).toBeTruthy();
    expect(screen.queryByText("Email unverified")).toBeNull();
  });

  it("treats an already-verified answer as done, not as a failure", async () => {
    h.customerApi.mockImplementation((url, init) => {
      if ((init as { method?: string } | undefined)?.method !== "POST") {
        return routeApi(undefined);
      }

      return Promise.reject(
        new CustomerApiError("This account's email is already verified.", "ALREADY_VERIFIED", 409)
      );
    });

    render(<AdminUsersPage />);

    fireEvent.click(
      (await screen.findAllByRole("button", { name: /verify email/i }))[0]
    );
    fireEvent.change(screen.getByLabelText(/reason/i), {
      target: { value: "verified on the phone earlier" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));

    expect(await screen.findByText(/was already verified/i)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reports a refusal without pretending the account changed", async () => {
    h.customerApi.mockImplementation((url, init) => {
      if ((init as { method?: string } | undefined)?.method !== "POST") {
        return routeApi(undefined);
      }

      return Promise.reject(
        new CustomerApiError("Administrator access required.", "ADMIN_ACCESS_REQUIRED", 403)
      );
    });

    render(<AdminUsersPage />);

    fireEvent.click(
      (await screen.findAllByRole("button", { name: /verify email/i }))[0]
    );
    fireEvent.change(screen.getByLabelText(/reason/i), {
      target: { value: "trying without permission" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Administrator access required."
    );
    // Still unverified: the badge is the operator's evidence.
    expect(screen.getByText("Email unverified")).toBeTruthy();
  });
});
