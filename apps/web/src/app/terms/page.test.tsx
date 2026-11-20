// @vitest-environment happy-dom

/**
 * Terms §6.3 used to defer to "our refund policy, available in your account
 * dashboard" and say refunds were reviewed "on a case-by-case basis" — while the
 * Refund Policy promises a full refund, tier fee included, for any request
 * cancelled before procurement. A customer could read both and not know which
 * applied, and the vaguer one was in the contract.
 *
 * These assertions pin the subsection to the published policy: the link must be
 * there, the full-refund promise must be stated, and the two phrases that
 * contradicted it must not come back.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import TermsPage from "./page";

function renderTerms() {
  render(<TermsPage />);
}

describe("Terms refunds", () => {
  it("links the Refund Policy from the refunds clause", () => {
    renderTerms();

    // The footer links the same page, so look for any of them pointing at the
    // policy rather than assuming this clause owns the only one.
    const links = screen.getAllByRole("link", { name: /refund policy/i });
    expect(links.some((link) => link.getAttribute("href") === "/refund-policy"))
      .toBe(true);
  });

  it("states the pre-procurement full refund the policy promises", () => {
    renderTerms();

    expect(
      screen.getByText(/refunded in full, including any Express tier fee/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/less any seller restocking charge/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no restocking fee, cancellation penalty or claim fee/i)
    ).toBeInTheDocument();
  });

  it("does not defer to a dashboard policy or a case-by-case review", () => {
    renderTerms();

    expect(screen.queryByText(/case-by-case/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/available in your account dashboard/i)
    ).not.toBeInTheDocument();
  });

  it("keeps a single h1", () => {
    renderTerms();

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
