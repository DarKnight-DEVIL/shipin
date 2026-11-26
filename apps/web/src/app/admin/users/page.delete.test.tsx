// @vitest-environment happy-dom

/**
 * The delete action on /admin/users.
 *
 * This is the only irreversible control in the console, so what is pinned is the
 * friction: the panel names the account, the button stays inert until the address is
 * typed exactly and a reason is given, and a server refusal leaves the row in place
 * instead of pretending it worked.
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
  CustomerApiError: class CustomerApiError extends Error {
    code?: string;
    constructor(message: string, code?: string) {
      super(message);
      this.code = code;
    }
  },
}));

import { CustomerApiError } from "@/lib/customerApiClient";

import AdminUsersPage from "./page";

const throwaway = {
  uid: "u-throwaway",
  email: "test-buyer@example.com",
  displayName: "Test Buyer",
  role: "customer",
  mfaEnabled: false,
  emailVerified: false,
  createdAt: 3_000,
};

const anotherAdmin = {
  uid: "u-admin",
  email: "second-admin@example.com",
  displayName: "Second Admin",
  role: "admin",
  mfaEnabled: true,
  emailVerified: true,
  createdAt: 2_000,
};

const self = {
  uid: "u-self",
  email: "me@example.com",
  displayName: "Me",
  role: "admin",
  mfaEnabled: true,
  emailVerified: true,
  createdAt: 1_000,
};

const list = [throwaway, anotherAdmin, self];

beforeEach(() => {
  h.customerApi.mockReset().mockImplementation((url: string, init) => {
    const method = (init as { method?: string } | undefined)?.method;

    if (method === "GET" || method === undefined) {
      return Promise.resolve({ users: list, nextCursor: null, hasMore: false });
    }

    return Promise.resolve({ success: true });
  });

  // Mirrors Firebase: the listener fires immediately with the signed-in account.
  h.onAuthStateChanged.mockReset().mockImplementation(
    (_auth: unknown, callback: (user: { uid: string }) => void) => {
      void callback({ uid: "u-self" });
      return () => {};
    }
  );
});

/** The POST body the page sent for the delete call, if any. */
function deleteCall() {
  return h.customerApi.mock.calls.find(([url]) =>
    String(url).endsWith("/delete")
  );
}

describe("AdminUsersPage: delete account", () => {
  it("offers deletion for customer accounts only", async () => {
    render(<AdminUsersPage />);

    const buttons = await screen.findAllByRole("button", { name: /delete/i });

    // One row is deletable: the throwaway customer. The other administrator and the
    // signed-in account are both refused by the server, so neither offers a button.
    expect(buttons).toHaveLength(1);
  });

  it("opens a panel that names the account before anything is sent", async () => {
    render(<AdminUsersPage />);

    fireEvent.click(
      (await screen.findAllByRole("button", { name: /delete/i }))[0]
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Test Buyer");
    expect(dialog).toHaveTextContent("test-buyer@example.com");
    expect(deleteCall()).toBeUndefined();
  });

  it("keeps deletion inert until the address is typed and a reason is given", async () => {
    render(<AdminUsersPage />);

    fireEvent.click(
      (await screen.findAllByRole("button", { name: /delete/i }))[0]
    );

    const confirm = screen.getByRole("button", { name: /delete account/i });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/why is this being deleted/i), {
      target: { value: "throwaway checkout test" },
    });
    // A reason alone is not enough: the point is that a mistouch cannot pass.
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/type .* to confirm/i), {
      target: { value: "test-buyer@example.com" },
    });
    expect(confirm).not.toBeDisabled();
  });

  it("says so when the typed address is wrong", async () => {
    render(<AdminUsersPage />);

    fireEvent.click(
      (await screen.findAllByRole("button", { name: /delete/i }))[0]
    );
    fireEvent.change(screen.getByLabelText(/why is this being deleted/i), {
      target: { value: "throwaway checkout test" },
    });
    fireEvent.change(screen.getByLabelText(/type .* to confirm/i), {
      target: { value: "test-buyer@example.co" },
    });

    expect(screen.getByText(/not the address on this account/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /delete account/i })).toBeDisabled();
  });

  it("sends the reason and the address, then drops the row", async () => {
    render(<AdminUsersPage />);

    fireEvent.click(
      (await screen.findAllByRole("button", { name: /delete/i }))[0]
    );
    fireEvent.change(screen.getByLabelText(/why is this being deleted/i), {
      target: { value: "throwaway checkout test" },
    });
    fireEvent.change(screen.getByLabelText(/type .* to confirm/i), {
      target: { value: "test-buyer@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /delete account/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const [, init] = deleteCall() as [string, { body: Record<string, unknown> }];
    expect(init.body).toEqual({
      reason: "throwaway checkout test",
      confirmEmail: "test-buyer@example.com",
    });
    expect(screen.queryByText("test-buyer@example.com")).toBeNull();
    expect(
      await screen.findByText(/was deleted/i)
    ).toBeTruthy();
  });

  it("keeps the row and shows the refusal when the server says the account has history", async () => {
    h.customerApi.mockImplementation((url: string, init) => {
      const method = (init as { method?: string } | undefined)?.method;

      if (method === "GET" || method === undefined) {
        return Promise.resolve({ users: list, nextCursor: null, hasMore: false });
      }

      return Promise.reject(
        new CustomerApiError(
          "This account has orders, so it cannot be deleted.",
          "ACCOUNT_HAS_HISTORY"
        )
      );
    });

    render(<AdminUsersPage />);

    fireEvent.click(
      (await screen.findAllByRole("button", { name: /delete/i }))[0]
    );
    fireEvent.change(screen.getByLabelText(/why is this being deleted/i), {
      target: { value: "throwaway checkout test" },
    });
    fireEvent.change(screen.getByLabelText(/type .* to confirm/i), {
      target: { value: "test-buyer@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /delete account/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This account has orders, so it cannot be deleted."
    );
    // Still listed and the panel is still open: the operator's evidence that nothing
    // happened. Four rows - the header plus all three accounts - so a removed row
    // (which leaves three) fails here.
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(4);
  });
});
