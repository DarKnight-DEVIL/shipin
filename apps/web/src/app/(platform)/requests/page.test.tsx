// @vitest-environment happy-dom

/**
 * Tests for the `/requests` live list header.
 *
 * The listener loads only the newest 200 requests. When there are more, the
 * header must say `200+` and a notice must explain that older requests are not
 * loaded, so a capped list never looks complete.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

type Subscription = (
  requests: unknown[],
  meta: { truncated: boolean; limit: number }
) => void;

const state = vi.hoisted(() => ({
  authCallback: null as null | ((user: { uid: string } | null) => void),
  subscription: null as null | Subscription,
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: state.push }),
}));

vi.mock("@/lib/firebase", () => ({
  auth: {
    onAuthStateChanged: (callback: (user: { uid: string } | null) => void) => {
      state.authCallback = callback;
      return () => {};
    },
  },
}));

vi.mock("@/features/requests/services/requests", () => ({
  REQUEST_SUBSCRIPTION_LIMIT: 200,
  subscribeToRequests: (_userId: string, callback: Subscription) => {
    state.subscription = callback;
    return () => {};
  },
}));

import RequestsPage from "./page";

function request(index: number) {
  return {
    id: `req-${index}`,
    status: "paid",
    items: [],
    createdAt: {
      seconds: 1_000 - index,
      toDate: () => new Date("2026-01-01T00:00:00Z"),
    },
  };
}

/** Renders the page, signs a user in and emits one list snapshot. */
function renderWith(requests: unknown[], truncated: boolean) {
  render(<RequestsPage />);

  act(() => {
    state.authCallback?.({ uid: "user-1" });
  });
  act(() => {
    state.subscription?.(requests, { truncated, limit: 200 });
  });
}

beforeEach(() => {
  state.authCallback = null;
  state.subscription = null;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("RequestsPage header", () => {
  it("shows 200+ and the truncation notice when the live list is capped", () => {
    renderWith(
      Array.from({ length: 200 }, (_, index) => request(index)),
      true
    );

    expect(screen.getByText(/200\+ requests/)).toBeInTheDocument();
    expect(screen.getByRole("status").textContent).toContain(
      "Showing your 200 most recent requests"
    );
  });

  it("shows the exact count and no notice below the cap", () => {
    renderWith([request(0)], false);

    expect(
      screen.getByText(/1 request · quotes, payments and deliveries/)
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
