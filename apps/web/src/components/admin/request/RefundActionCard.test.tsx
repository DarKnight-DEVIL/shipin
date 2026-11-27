// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Request } from "@/types/request";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/adminApiClient", () => ({
  AdminApiError: class AdminApiError extends Error {},
  adminApi: vi.fn(),
}));

import RequestDetailsView from "./RefundActionCard";

function requestWith(
  refundRequest: Record<string, unknown>
): Request {
  return {
    id: "req-1",
    status: "refund_requested",
    payment: {
      provider: "paypal",
      orderId: "ORDER-1",
      amount: 40,
      amountPaid: 40,
      walletAmount: 10,
      paypalAmount: 30,
      currency: "USD",
    },
    refundRequest: {
      status: "requested",
      amount: 40,
      ...refundRequest,
    },
  } as unknown as Request;
}

describe("RefundActionCard", () => {
  it("splits an original_sources refund into its wallet and PayPal shares", () => {
    render(
      <RequestDetailsView request={requestWith({ preference: "original_sources" })} />
    );

    expect(screen.getByText("Original Payment Sources")).toBeInTheDocument();

    // The wallet share and the PayPal share are both actionable, so the card
    // no longer looks like there is nothing left to refund.
    expect(
      screen.getByRole("button", {
        name: "Process $10.00 Wallet Refund",
      })
    ).toBeInTheDocument();
    expect(screen.getByText("$30.00")).toBeInTheDocument();
    expect(screen.getByText("+$10.00")).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Complete Refund" })
    ).toBeDisabled();
  });

  it("renders only the remaining split after a partial refund", () => {
    render(
      <RequestDetailsView
        request={requestWith({
          preference: "original_sources",
          amount: 25,
          walletAmount: 0,
          paypalAmount: 25,
        })}
      />
    );

    // The $10 wallet share was already refunded, so there is no wallet button
    // and the PayPal portion is the remainder, not the original $30.
    expect(
      screen.queryByRole("button", { name: /Wallet Refund/ })
    ).not.toBeInTheDocument();
    expect(screen.getByText("$25.00", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("$25.00", { selector: "p" })).toBeInTheDocument();
  });

  it("sends the remainder to the wallet for the wallet preference", () => {
    render(
      <RequestDetailsView
        request={requestWith({
          preference: "wallet",
          amount: 25,
          walletAmount: 25,
          paypalAmount: 0,
        })}
      />
    );

    expect(
      screen.getByRole("button", {
        name: "Process $25.00 Wallet Refund",
      })
    ).toBeInTheDocument();
  });

  it("enables completion once both original_sources portions are done", () => {
    render(
      <RequestDetailsView
        request={requestWith({
          preference: "original_sources",
          walletStatus: "completed",
          paypalRefundStatus: "completed",
        })}
      />
    );

    expect(
      screen.getByRole("button", { name: "Complete Refund" })
    ).toBeEnabled();
  });
});
