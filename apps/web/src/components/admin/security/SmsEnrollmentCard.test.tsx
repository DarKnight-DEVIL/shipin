// @vitest-environment happy-dom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MfaApiError } from "@/lib/mfaApi";
import type { MfaConfigStatus } from "@/lib/mfaSetupClient";
import SmsEnrollmentCard from "./SmsEnrollmentCard";

vi.mock("@/lib/mfaSetupClient", () => ({
  sendSmsCode: vi.fn(),
  confirmSmsCode: vi.fn(),
}));

const { sendSmsCode, confirmSmsCode } = await import("@/lib/mfaSetupClient");

const STATUS: MfaConfigStatus = {
  totp: { enabled: true, pending: false },
  sms: { enabled: false, phoneNumber: null },
  backupCodes: 10,
  webauthn: { enabled: false, credentials: [] },
};

function renderCard(onChanged = vi.fn()) {
  return render(
    <SmsEnrollmentCard idToken="token" status={STATUS} onChanged={onChanged} />
  );
}

beforeEach(() => {
  vi.mocked(sendSmsCode).mockReset();
  vi.mocked(confirmSmsCode).mockReset();
});

describe("SmsEnrollmentCard", () => {
  it("rejects a phone number that is not E.164 without calling the API", () => {
    renderCard();

    fireEvent.change(screen.getByLabelText("Phone number"), {
      target: { value: "555 123 4567" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));

    expect(
      screen.getByText("Use international format, for example +15551234567.")
    ).toBeInTheDocument();
    expect(sendSmsCode).not.toHaveBeenCalled();
  });

  it("sends a code and moves to the confirmation step", async () => {
    vi.mocked(sendSmsCode).mockResolvedValue(
      "Verification code sent to +15551234567. Expires in 5 minutes."
    );

    renderCard();

    fireEvent.change(screen.getByLabelText("Phone number"), {
      target: { value: "+15551234567" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));

    expect(
      await screen.findByText(/Verification code sent/)
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Enter the code we sent")).toBeInTheDocument();
    expect(sendSmsCode).toHaveBeenCalledWith("token", "+15551234567");
  });

  it("enables SMS after a valid code and refreshes the caller", async () => {
    vi.mocked(sendSmsCode).mockResolvedValue("Code sent.");
    vi.mocked(confirmSmsCode).mockResolvedValue("SMS MFA enabled successfully.");

    const onChanged = vi.fn();
    renderCard(onChanged);

    fireEvent.change(screen.getByLabelText("Phone number"), {
      target: { value: "+15551234567" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    await screen.findByLabelText("Enter the code we sent");

    fireEvent.change(screen.getByPlaceholderText("123456"), {
      target: { value: "654321" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify and enable" }));

    expect(
      await screen.findByText("SMS MFA enabled successfully.")
    ).toBeInTheDocument();
    expect(confirmSmsCode).toHaveBeenCalledWith("token", "654321");
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("reports an expired code and stays on the confirmation step", async () => {
    vi.mocked(sendSmsCode).mockResolvedValue("Code sent.");
    vi.mocked(confirmSmsCode).mockRejectedValue(
      new MfaApiError(
        "Verification code expired.",
        "SMS_VERIFICATION_EXPIRED",
        400
      )
    );

    renderCard();

    fireEvent.change(screen.getByLabelText("Phone number"), {
      target: { value: "+15551234567" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    await screen.findByLabelText("Enter the code we sent");

    fireEvent.change(screen.getByPlaceholderText("123456"), {
      target: { value: "111111" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify and enable" }));

    expect(
      await screen.findByText("Verification code expired.")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Enter the code we sent")).toBeInTheDocument();
  });
});
