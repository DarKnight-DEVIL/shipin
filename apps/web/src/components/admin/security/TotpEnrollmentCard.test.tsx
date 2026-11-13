// @vitest-environment happy-dom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MfaApiError } from "@/lib/mfaApi";
import type { MfaConfigStatus } from "@/lib/mfaSetupClient";
import TotpEnrollmentCard from "./TotpEnrollmentCard";

vi.mock("qrcode.react", () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <div data-testid="qr" data-value={value} />
  ),
}));

vi.mock("@/lib/mfaSetupClient", () => ({
  beginTotpEnrollment: vi.fn(),
  confirmTotpEnrollment: vi.fn(),
}));

const { beginTotpEnrollment, confirmTotpEnrollment } = await import(
  "@/lib/mfaSetupClient"
);

const DISABLED: MfaConfigStatus = {
  totp: { enabled: false, pending: false },
  sms: { enabled: false, phoneNumber: null },
  backupCodes: 0,
  webauthn: { enabled: false, credentials: [] },
};

const ENABLED: MfaConfigStatus = {
  totp: { enabled: true, pending: false },
  sms: { enabled: false, phoneNumber: null },
  backupCodes: 10,
  webauthn: { enabled: false, credentials: [] },
};

function renderCard(status: MfaConfigStatus, onChanged = vi.fn()) {
  return {
    onChanged,
    ...render(
      <TotpEnrollmentCard
        idToken="token"
        status={status}
        onChanged={onChanged}
      />
    ),
  };
}

beforeEach(() => {
  vi.mocked(beginTotpEnrollment).mockReset();
  vi.mocked(confirmTotpEnrollment).mockReset();
});

describe("TotpEnrollmentCard", () => {
  it("offers setup when no authenticator is enrolled", () => {
    renderCard(DISABLED);

    expect(
      screen.getByRole("button", { name: "Set up authenticator" })
    ).toBeInTheDocument();
    expect(screen.getByText("Not enabled")).toBeInTheDocument();
  });

  it("shows the secret and QR code after starting enrollment", async () => {
    vi.mocked(beginTotpEnrollment).mockResolvedValue({
      secret: "JBSWY3DPEHPK3PXP",
      qrUrl: "otpauth://totp/ShipIN:admin@example.com?secret=JBSWY3DPEHPK3PXP",
      qrDataUrl: "data:image/png;base64,qr-stub",
    });

    renderCard(DISABLED);
    fireEvent.click(screen.getByRole("button", { name: "Set up authenticator" }));

    expect(await screen.findByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    expect(screen.getByTestId("qr")).toBeInTheDocument();
    expect(beginTotpEnrollment).toHaveBeenCalledWith("token");
  });

  it("confirms the first code and reveals backup codes", async () => {
    vi.mocked(beginTotpEnrollment).mockResolvedValue({
      secret: "JBSWY3DPEHPK3PXP",
      qrUrl: "otpauth://totp/x",
      qrDataUrl: "data:image/png;base64,qr-stub",
    });
    vi.mocked(confirmTotpEnrollment).mockResolvedValue([
      "AAAA-BBBB",
      "CCCC-DDDD",
    ]);

    const { onChanged } = renderCard(DISABLED);

    fireEvent.click(screen.getByRole("button", { name: "Set up authenticator" }));
    await screen.findByText("JBSWY3DPEHPK3PXP");

    fireEvent.change(screen.getByPlaceholderText("123456"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify and enable" }));

    expect(await screen.findByText("AAAA-BBBB")).toBeInTheDocument();
    expect(screen.getByText("CCCC-DDDD")).toBeInTheDocument();
    expect(confirmTotpEnrollment).toHaveBeenCalledWith("token", "123456");
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("surfaces a rejected code without leaving the setup step", async () => {
    vi.mocked(beginTotpEnrollment).mockResolvedValue({
      secret: "JBSWY3DPEHPK3PXP",
      qrUrl: "otpauth://totp/x",
      qrDataUrl: "data:image/png;base64,qr-stub",
    });
    vi.mocked(confirmTotpEnrollment).mockRejectedValue(
      new MfaApiError("Invalid TOTP code.", "INVALID_TOTP_CODE", 400)
    );

    renderCard(DISABLED);

    fireEvent.click(screen.getByRole("button", { name: "Set up authenticator" }));
    await screen.findByText("JBSWY3DPEHPK3PXP");

    fireEvent.change(screen.getByPlaceholderText("123456"), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify and enable" }));

    expect(await screen.findByText("Invalid TOTP code.")).toBeInTheDocument();
    expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
  });

  it("asks for confirmation before replacing an existing secret", () => {
    renderCard(ENABLED);

    fireEvent.click(
      screen.getByRole("button", { name: "Re-enroll authenticator" })
    );

    expect(
      screen.getByText("Replace the current authenticator secret?")
    ).toBeInTheDocument();
    expect(beginTotpEnrollment).not.toHaveBeenCalled();
  });
});
