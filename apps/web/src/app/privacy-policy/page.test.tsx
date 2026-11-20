// @vitest-environment happy-dom

/**
 * Compliance coverage of the Privacy Policy.
 *
 * These disclosures are the ones a GDPR/DPDP review asks for by name, and the
 * page had none of them before: no legal basis, no retention periods, no
 * sub-processor statement, no breach commitment, no marketing statement. This
 * test keeps them present, so a future copy edit cannot quietly drop one.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import PrivacyPolicyPage from "./page";

function renderPolicy() {
  render(<PrivacyPolicyPage />);
}

function heading(name: RegExp) {
  return screen.getByRole("heading", { name });
}

describe("Privacy Policy disclosures", () => {
  it("keeps exactly one h1 and a section per required disclosure", () => {
    renderPolicy();

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(heading(/Legal Basis for Processing/i)).toBeInTheDocument();
    expect(heading(/Data Retention/i)).toBeInTheDocument();
    expect(heading(/Where your data is processed/i)).toBeInTheDocument();
    expect(heading(/Marketing and consent/i)).toBeInTheDocument();
    expect(
      heading(/Sub-processors and data processing agreements/i)
    ).toBeInTheDocument();
    expect(heading(/Personal data breaches/i)).toBeInTheDocument();
  });

  it("states retention periods rather than \"as long as needed\"", () => {
    renderPolicy();

    expect(screen.getByText(/8 years \(tax and accounting law\)/i)).toBeInTheDocument();
    expect(screen.getByText(/24 months after delivery/i)).toBeInTheDocument();
    expect(screen.getByText(/90 days/i)).toBeInTheDocument();
  });

  it("names the legal bases it relies on", () => {
    renderPolicy();

    expect(screen.getAllByText(/Art\. 6\(1\)\(b\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Art\. 6\(1\)\(f\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Art\. 6\(1\)\(a\)/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Digital Personal Data Protection Act/i)).toBeInTheDocument();
  });

  it("says marketing email does not exist and how consent is withdrawn", () => {
    renderPolicy();

    expect(screen.getByText(/do not run marketing or promotional email/i)).toBeInTheDocument();
    expect(screen.getByText(/one-click unsubscribe link/i)).toBeInTheDocument();
    expect(screen.getByText(/72 hours/i)).toBeInTheDocument();
  });
});
