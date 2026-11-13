// @vitest-environment happy-dom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AdminMfaGate from "./AdminMfaGate";

const fakeUser = { getIdToken: vi.fn(async () => "id-token") };

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, callback: (user: unknown) => void) => {
    callback(fakeUser);
    return () => {};
  },
}));

vi.mock("@/lib/mfaSessionClient", () => ({
  getMfaSessionStatus: vi.fn(),
  startMfaSession: vi.fn(),
  startWebAuthnSession: vi.fn(),
}));

vi.mock("@/lib/webauthnClient", () => ({
  isWebAuthnSupported: vi.fn(() => true),
  assertSecurityKey: vi.fn(),
  WebAuthnCeremonyError: class extends Error {},
}));

const { getMfaSessionStatus, startWebAuthnSession, startMfaSession } =
  await import("@/lib/mfaSessionClient");
const { assertSecurityKey, isWebAuthnSupported } = await import(
  "@/lib/webauthnClient"
);

const BASE_STATUS = {
  elevated: false,
  expiresAt: null,
  sessionTtlMs: 1_800_000,
};

function renderGate() {
  return render(
    <AdminMfaGate>
      <p>admin content</p>
    </AdminMfaGate>
  );
}

beforeEach(() => {
  vi.mocked(getMfaSessionStatus).mockReset();
  vi.mocked(startMfaSession).mockReset();
  vi.mocked(startWebAuthnSession).mockReset();
  vi.mocked(assertSecurityKey).mockReset();
  vi.mocked(isWebAuthnSupported).mockReturnValue(true);
});

describe("AdminMfaGate", () => {
  it("shows nothing when the session is already elevated", async () => {
    vi.mocked(getMfaSessionStatus).mockResolvedValue({
      ...BASE_STATUS,
      elevated: true,
      methods: ["totp"],
    });

    renderGate();

    await screen.findByText("admin content");
    expect(screen.queryByRole("button", { name: "Verify" })).not.toBeInTheDocument();
  });

  it("elevates with a security key assertion", async () => {
    vi.mocked(getMfaSessionStatus).mockResolvedValue({
      ...BASE_STATUS,
      methods: ["webauthn"],
    });
    vi.mocked(assertSecurityKey).mockResolvedValue({
      id: "cred-1",
      type: "public-key",
    } as never);
    vi.mocked(startWebAuthnSession).mockResolvedValue({
      expiresAt: 123,
      method: "webauthn",
    });

    renderGate();

    fireEvent.click(await screen.findByRole("button", { name: "Verify" }));

    // No code field for a security key, just the ceremony button.
    expect(screen.getByText("Security key")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("6-digit code")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Use security key" }));

    await waitFor(() =>
      expect(startWebAuthnSession).toHaveBeenCalledWith("id-token", {
        id: "cred-1",
        type: "public-key",
      })
    );
    expect(assertSecurityKey).toHaveBeenCalledWith("id-token");
    expect(startMfaSession).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.queryByText(/Verify with your second factor/i)
      ).not.toBeInTheDocument()
    );
  });

  it("reports a cancelled ceremony without elevating", async () => {
    vi.mocked(getMfaSessionStatus).mockResolvedValue({
      ...BASE_STATUS,
      methods: ["webauthn"],
    });

    const { WebAuthnCeremonyError } = await import("@/lib/webauthnClient");

    vi.mocked(assertSecurityKey).mockRejectedValue(
      new (WebAuthnCeremonyError as unknown as new (m: string) => Error)(
        "Security key prompt was cancelled."
      )
    );

    renderGate();

    fireEvent.click(await screen.findByRole("button", { name: "Verify" }));
    fireEvent.click(screen.getByRole("button", { name: "Use security key" }));

    expect(
      await screen.findByText("Security key prompt was cancelled.")
    ).toBeInTheDocument();
    expect(startWebAuthnSession).not.toHaveBeenCalled();
  });

  it("offers code entry when the account uses an authenticator app", async () => {
    vi.mocked(getMfaSessionStatus).mockResolvedValue({
      ...BASE_STATUS,
      methods: ["totp"],
    });
    vi.mocked(startMfaSession).mockResolvedValue({
      expiresAt: 456,
      method: "totp",
    });

    renderGate();

    fireEvent.click(await screen.findByRole("button", { name: "Verify" }));
    fireEvent.change(screen.getByPlaceholderText("6-digit code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() =>
      expect(startMfaSession).toHaveBeenCalledWith("id-token", "totp", "123456")
    );
    expect(assertSecurityKey).not.toHaveBeenCalled();
  });

  it("explains when a security-key account is opened in a browser without WebAuthn", async () => {
    vi.mocked(isWebAuthnSupported).mockReturnValue(false);
    vi.mocked(getMfaSessionStatus).mockResolvedValue({
      ...BASE_STATUS,
      methods: ["webauthn"],
    });

    renderGate();

    expect(
      await screen.findByText(/this browser does not support WebAuthn/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verify" })).not.toBeInTheDocument();
  });
});
