// @vitest-environment happy-dom

/**
 * The data-rights Settings section is the only caller of
 * `/api/user/consent`, `/api/user/export` and `/api/user/grievance`. Before
 * this section existed those endpoints were unreachable from the product, so
 * the tests here pin the wiring: the download must hit the export endpoint,
 * toggles must post the exact consent payload, and a grievance must be
 * submitted with the details the customer typed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const customerApiMock = vi.fn();

vi.mock("@/lib/customerApiClient", () => ({
  customerApi: (...args: unknown[]) => customerApiMock(...args),
}));

import DataRightsSection from "./DataRightsSection";

beforeEach(() => {
  customerApiMock.mockReset();
  customerApiMock.mockResolvedValue({
    success: true,
    consentState: {
      marketing: {
        granted: true,
        version: "1",
        updatedAt: "2026-11-01T00:00:00.000Z",
        method: "explicit",
      },
    },
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
});

describe("DataRightsSection", () => {
  it("loads and shows the current consent state", async () => {
    render(<DataRightsSection />);

    await waitFor(() => {
      expect(customerApiMock).toHaveBeenCalledWith("/api/user/consent", {
        method: "GET",
      });
    });

    // Marketing was granted; analytics was never logged, so it is off.
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: "Marketing" })).toHaveAttribute(
        "aria-checked",
        "true"
      );
    });
    expect(screen.getByRole("switch", { name: "Analytics" })).toHaveAttribute(
      "aria-checked",
      "false"
    );
  });

  it("renders the consent history and discloses the 50-entry cap", async () => {
    customerApiMock.mockResolvedValue({
      success: true,
      consentState: {},
      consentLog: [
        {
          id: "log-1",
          category: "marketing",
          granted: true,
          method: "explicit",
          timestamp: "2026-11-01T00:00:00.000Z",
        },
      ],
      consentLogMeta: { limit: 50, truncated: true },
    });

    render(<DataRightsSection />);

    expect(await screen.findByText(/Granted: marketing/)).toBeTruthy();
    expect(
      await screen.findByText(/Showing your 50 most recent consent changes/)
    ).toBeTruthy();
  });

  it("posts the exact consent payload when a toggle changes", async () => {
    render(<DataRightsSection />);
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: "Analytics" })).toBeTruthy();
    });

    customerApiMock.mockResolvedValue({
      success: true,
      message: "Consent granted",
    });

    fireEvent.click(screen.getByRole("switch", { name: "Analytics" }));

    await waitFor(() => {
      expect(customerApiMock).toHaveBeenCalledWith("/api/user/consent", {
        method: "POST",
        body: {
          category: "analytics",
          granted: true,
          version: "1",
          method: "explicit",
        },
      });
    });
  });

  it("downloads the export bundle from /api/user/export", async () => {
    render(<DataRightsSection />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Download my data" })
      ).toBeTruthy();
    });

    customerApiMock.mockResolvedValue({ profile: { displayName: "Ada" } });
    const clickSpy = vi.fn();
    const realCreateElement = document.createElement.bind(document);
    const createSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tag: string) => {
        if (tag === "a") {
          return {
            click: clickSpy,
            href: "",
            download: "",
          } as unknown as HTMLAnchorElement;
        }
        return realCreateElement(tag);
      });

    fireEvent.click(screen.getByRole("button", { name: "Download my data" }));

    await waitFor(() => {
      expect(customerApiMock).toHaveBeenCalledWith("/api/user/export", {
        method: "GET",
      });
    });
    expect(clickSpy).toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalled();
    createSpy.mockRestore();
  });

  it("submits a grievance with the typed details", async () => {
    render(<DataRightsSection />);
    await waitFor(() => {
      expect(screen.getByLabelText("What happened?")).toBeTruthy();
    });

    customerApiMock.mockResolvedValue({
      success: true,
      requestId: "gr-1",
      message: "Your request has been submitted.",
    });

    fireEvent.change(screen.getByLabelText("What happened?"), {
      target: { value: "You emailed the wrong address" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit request" }));

    await waitFor(() => {
      expect(customerApiMock).toHaveBeenCalledWith("/api/user/grievance", {
        method: "POST",
        body: { right: "grievance", details: "You emailed the wrong address" },
      });
    });
    expect(
      await screen.findByText("Your request has been submitted.")
    ).toBeTruthy();
  });
});
