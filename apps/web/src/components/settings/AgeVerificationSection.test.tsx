// @vitest-environment happy-dom

/**
 * The age-verification Settings section is the only caller of
 * `GET/POST /api/user/age-verification` and the only writer of the profile's
 * `dateOfBirth`. Before this section existed the DPDP age gate was dormant —
 * nothing collected a date of birth, so `enforceAgeGate` always allowed. The
 * tests here pin the wiring: the status check on load, the date-of-birth save,
 * and the parental-consent request/verify round trip.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const customerApiMock = vi.fn();
const getUserProfileMock = vi.fn();
const updateUserProfileMock = vi.fn();

vi.mock("@/lib/customerApiClient", () => ({
  customerApi: (...args: unknown[]) => customerApiMock(...args),
}));

vi.mock("@/lib/firebase", () => ({
  auth: { currentUser: { uid: "user-1" } },
}));

vi.mock("@/features/users/client/userProfile", () => ({
  getUserProfile: (...args: unknown[]) => getUserProfileMock(...args),
  updateUserProfile: (...args: unknown[]) => updateUserProfileMock(...args),
}));

import AgeVerificationSection from "./AgeVerificationSection";

const statusResponse = (overrides: Record<string, unknown> = {}) => ({
  success: true,
  parentalConsentVerified: false,
  ageGate: { allowed: true },
  ...overrides,
});

beforeEach(() => {
  customerApiMock.mockReset().mockResolvedValue(statusResponse());
  getUserProfileMock.mockReset().mockResolvedValue(null);
  updateUserProfileMock.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("AgeVerificationSection", () => {
  it("loads the verification status and any saved date of birth", async () => {
    getUserProfileMock.mockResolvedValue({ dateOfBirth: "2010-03-15" });

    render(<AgeVerificationSection />);

    await waitFor(() => {
      expect(customerApiMock).toHaveBeenCalledWith("/api/user/age-verification", {
        method: "GET",
      });
    });

    expect(getUserProfileMock).toHaveBeenCalledWith();
    expect(
      (screen.getByLabelText(/date of birth/i) as HTMLInputElement).value
    ).toBe("2010-03-15");
    expect(await screen.findByText(/age: 16/i)).toBeTruthy();
    expect(screen.getByText(/no consent needed/i)).toBeTruthy();
  });

  it("saves a changed date of birth and re-checks the gate", async () => {
    customerApiMock
      .mockResolvedValueOnce(statusResponse())
      .mockResolvedValueOnce(
        statusResponse({
          ageGate: {
            allowed: false,
            error: "Users under 18 require verified parental consent per DPDP Act 2023",
          },
        })
      );

    render(<AgeVerificationSection />);

    await waitFor(() => {
      expect(screen.getByLabelText(/date of birth/i)).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(/date of birth/i), {
      target: { value: "2012-01-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(updateUserProfileMock).toHaveBeenCalledWith( {
        dateOfBirth: "2012-01-01",
      });
    });

    await waitFor(() => {
      expect(customerApiMock).toHaveBeenCalledTimes(2);
    });

    expect(
      await screen.findByText(/require verified parental consent/i)
    ).toBeTruthy();
  });

  it("offers the consent form and verifies the parent's code", async () => {
    customerApiMock
      .mockResolvedValueOnce(
        statusResponse({
          ageGate: {
            allowed: false,
            error: "Users under 18 require verified parental consent per DPDP Act 2023",
          },
        })
      )
      // consent request
      .mockResolvedValueOnce({ success: true, consentId: "consent-1" })
      // otp verification
      .mockResolvedValueOnce({ success: true })
      // status refresh after verification
      .mockResolvedValueOnce(statusResponse({ parentalConsentVerified: true }));

    render(<AgeVerificationSection />);

    await screen.findByText(/require verified parental consent/i);

    fireEvent.change(screen.getByLabelText(/parent's email/i), {
      target: { value: "parent@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /request parental consent/i })
    );

    await waitFor(() => {
      expect(customerApiMock).toHaveBeenCalledWith("/api/user/age-verification", {
        method: "POST",
        body: {
          action: "request",
          parentEmail: "parent@example.com",
          method: "otp",
        },
      });
    });

    expect(
      await screen.findByText(/emailed the parent a 6-digit code/i)
    ).toBeTruthy();

    fireEvent.change(
      screen.getByLabelText(/6-digit code from the parent's email/i),
      { target: { value: "123456" } }
    );
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));

    await waitFor(() => {
      expect(customerApiMock).toHaveBeenCalledWith("/api/user/age-verification", {
        method: "POST",
        body: { action: "verify-otp", consentId: "consent-1", otp: "123456" },
      });
    });

    expect((await screen.findAllByText(/parental consent verified\./i)).length).toBeGreaterThan(
      0
    );
  });

  it("rejects a malformed code locally without calling the API", async () => {
    customerApiMock
      .mockResolvedValueOnce(
        statusResponse({
          ageGate: {
            allowed: false,
            error: "Users under 18 require verified parental consent per DPDP Act 2023",
          },
        })
      )
      // consent request
      .mockResolvedValueOnce({ success: true, consentId: "consent-1" });

    render(<AgeVerificationSection />);

    await screen.findByText(/require verified parental consent/i);

    fireEvent.change(screen.getByLabelText(/parent's email/i), {
      target: { value: "parent@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /request parental consent/i })
    );

    await screen.findByText(/emailed the parent a 6-digit code/i);

    fireEvent.change(
      screen.getByLabelText(/6-digit code from the parent's email/i),
      { target: { value: "12ab" } }
    );
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));

    expect(
      await screen.findByText(/enter the 6-digit code/i)
    ).toBeTruthy();
    expect(customerApiMock).toHaveBeenCalledTimes(2);
  });
});
