// @vitest-environment happy-dom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MfaConfigStatus } from "@/lib/mfaSetupClient";
import WebAuthnCard from "./WebAuthnCard";

vi.mock("@/lib/webauthnClient", () => ({
  isWebAuthnSupported: vi.fn(() => true),
  registerSecurityKey: vi.fn(),
  completeSecurityKeyRegistration: vi.fn(),
  removeSecurityKey: vi.fn(),
  WebAuthnCeremonyError: class extends Error {
    cancelled = true;
  },
}));

const {
  isWebAuthnSupported,
  registerSecurityKey,
  completeSecurityKeyRegistration,
  removeSecurityKey,
} = await import("@/lib/webauthnClient");

function statusWith(
  credentials: { id: string; name: string; createdAt: number }[]
): MfaConfigStatus {
  return {
    totp: { enabled: true, pending: false },
    sms: { enabled: false, phoneNumber: null },
    backupCodes: 10,
    webauthn: { enabled: credentials.length > 0, credentials },
  };
}

function renderCard(status = statusWith([]), onChanged = vi.fn()) {
  return {
    onChanged,
    ...render(
      <WebAuthnCard idToken="token" status={status} onChanged={onChanged} />
    ),
  };
}

beforeEach(() => {
  vi.mocked(isWebAuthnSupported).mockReturnValue(true);
  vi.mocked(registerSecurityKey).mockReset();
  vi.mocked(completeSecurityKeyRegistration).mockReset();
  vi.mocked(removeSecurityKey).mockReset();
});

describe("WebAuthnCard", () => {
  it("registers a key through both ceremony steps", async () => {
    const credential = { id: "cred-1", type: "public-key" };
    vi.mocked(registerSecurityKey).mockResolvedValue(credential as never);
    vi.mocked(completeSecurityKeyRegistration).mockResolvedValue({
      id: "cred-1",
      name: "YubiKey",
    });

    const { onChanged } = renderCard();

    fireEvent.change(screen.getByPlaceholderText("Key name (e.g. YubiKey 5C)"), {
      target: { value: "YubiKey" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add security key" }));

    expect(await screen.findByText("YubiKey registered.")).toBeInTheDocument();
    expect(registerSecurityKey).toHaveBeenCalledWith("token", "YubiKey");
    expect(completeSecurityKeyRegistration).toHaveBeenCalledWith(
      "token",
      credential,
      "YubiKey"
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("lists registered keys with their name and date", () => {
    renderCard(statusWith([
      { id: "cred-1", name: "YubiKey 5C", createdAt: 1_700_000_000_000 },
      { id: "cred-2", name: "MacBook Touch ID", createdAt: 1_710_000_000_000 },
    ]));

    expect(screen.getByText("YubiKey 5C")).toBeInTheDocument();
    expect(screen.getByText("MacBook Touch ID")).toBeInTheDocument();
    expect(screen.getByText("2 registered")).toBeInTheDocument();
  });

  it("asks for confirmation before removing a key", async () => {
    vi.mocked(removeSecurityKey).mockResolvedValue(0);

    const onChanged = vi.fn();
    renderCard(statusWith([
      { id: "cred-1", name: "YubiKey", createdAt: 1_700_000_000_000 },
    ]), onChanged);

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(screen.getByText("Remove?")).toBeInTheDocument();
    expect(removeSecurityKey).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Yes" }));

    expect(await screen.findByText("Security key removed.")).toBeInTheDocument();
    expect(removeSecurityKey).toHaveBeenCalledWith("token", "cred-1");
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("explains that the last factor cannot be removed", async () => {
    const { MfaApiError } = await import("@/lib/mfaApi");

    vi.mocked(removeSecurityKey).mockRejectedValue(
      new MfaApiError(
        "This is your only second factor. Set up an authenticator app or SMS first.",
        "WEBAUTHN_CREDENTIAL_EXISTS",
        400
      )
    );

    renderCard(statusWith([
      { id: "cred-1", name: "YubiKey", createdAt: 1_700_000_000_000 },
    ]));

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));

    expect(
      await screen.findByText(/only second factor/i)
    ).toBeInTheDocument();
  });

  it("tells the user when the browser has no WebAuthn support", () => {
    vi.mocked(isWebAuthnSupported).mockReturnValue(false);

    renderCard();

    expect(
      screen.getByText(/does not support security keys/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add security key" })
    ).not.toBeInTheDocument();
  });
});
