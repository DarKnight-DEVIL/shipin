// @vitest-environment happy-dom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MfaConfigStatus } from "@/lib/mfaSetupClient";
import SmsEnrollmentCard from "./SmsEnrollmentCard";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({
  auth: { currentUser: { uid: "admin-1" } },
}));

vi.mock("@/lib/firebaseMfa", () => ({
  FirebaseMfaError: class FirebaseMfaError extends Error {},
  RECAPTCHA_CONTAINER_ID: "mfa-recaptcha",
  startSmsEnrollment: mocks.start,
  confirmSmsEnrollment: mocks.confirm,
}));

const STATUS: MfaConfigStatus = {
  totp: { enabled: true, pending: false },
  sms: { enabled: false, phoneNumber: null },
  backupCodes: 10,
  webauthn: { enabled: false, rpID: null, credentials: [] },
};

function renderCard(onChanged = vi.fn()) {
  return render(<SmsEnrollmentCard status={STATUS} onChanged={onChanged} />);
}

beforeEach(() => {
  mocks.start.mockReset();
  mocks.confirm.mockReset();
});

describe("SmsEnrollmentCard", () => {
  it("rejects a phone number that is not E.164 without starting a ceremony", () => {
    renderCard();

    fireEvent.change(screen.getByLabelText("Phone number"), {
      target: { value: "555 123 4567" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));

    expect(
      screen.getByText("Use international format, for example +15551234567.")
    ).toBeInTheDocument();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("starts the Identity Platform ceremony and moves to the confirmation step", async () => {
    mocks.start.mockResolvedValue("verification-id");

    renderCard();

    fireEvent.change(screen.getByLabelText("Phone number"), {
      target: { value: "+15551234567" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));

    expect(
      await screen.findByText(/Google sent a code to/)
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Enter the code we sent")).toBeInTheDocument();
    expect(mocks.start).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ uid: "admin-1" }),
      "+15551234567"
    );
  });

  it("enables SMS after a valid code and refreshes the caller", async () => {
    mocks.start.mockResolvedValue("verification-id");
    mocks.confirm.mockResolvedValue(undefined);

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
      await screen.findByText(
        "SMS enabled. You will be asked for a code at every sign-in."
      )
    ).toBeInTheDocument();
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "admin-1" }),
      "verification-id",
      "654321"
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("reports a rejected code and stays on the confirmation step", async () => {
    mocks.start.mockResolvedValue("verification-id");
    mocks.confirm.mockRejectedValue(new Error("invalid-code"));

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
      await screen.findByText("Could not verify that code.")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Enter the code we sent")).toBeInTheDocument();
  });
});
