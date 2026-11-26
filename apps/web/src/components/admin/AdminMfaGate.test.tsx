// @vitest-environment happy-dom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AdminMfaGate from "./AdminMfaGate";
import { MfaApiError } from "@/lib/mfaApi";

const fakeUser = { getIdToken: vi.fn(async () => "id-token") };

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, callback: (user: unknown) => void) => {
    callback(fakeUser);
    return () => {};
  },
}));

const appCheckState = vi.hoisted(() => ({ detail: null as string | null }));

vi.mock("@/lib/firebase", () => ({
  auth: {},
  getAppCheckFailureDetail: () => appCheckState.detail,
}));

vi.mock("@/lib/mfaSessionClient", () => ({
  getMfaSessionStatus: vi.fn(),
  startMfaSession: vi.fn(),
}));

const { getMfaSessionStatus, startMfaSession } =
  await import("@/lib/mfaSessionClient");

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
  appCheckState.detail = null;
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
    expect(
      screen.queryByRole("button", { name: "Verify" })
    ).not.toBeInTheDocument();
  });

  it("explains an App Check rejection instead of asking for a code", async () => {
    // The user-visible symptom of this bug was an admin who had never enrolled
    // being asked for an authenticator code. The request never reached the MFA
    // logic: App Check refused it. Offering the code form for that is worse than
    // an error message, because it implies the code is the problem.
    vi.mocked(getMfaSessionStatus).mockRejectedValue(
      new MfaApiError("App verification failed.", "APP_CHECK_FAILED", 401)
    );

    renderGate();

    expect(
      await screen.findByText(/could not prove it is running the real ShipIN app/i)
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("6-digit code")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verify" })).not.toBeInTheDocument();
  });

  it("names the reason App Check gave, so the cause is readable without the console", async () => {
    // "App verification failed" alone cannot distinguish a blocked reCAPTCHA from
    // a key that rejects this domain or an exhausted quota - and those need
    // different fixes. The SDK has the reason; the panel has to show it.
    appCheckState.detail = "appCheck/recaptcha-error: 403 Forbidden";
    vi.mocked(getMfaSessionStatus).mockRejectedValue(
      new MfaApiError("App verification failed.", "APP_CHECK_FAILED", 401)
    );

    renderGate();

    expect(
      await screen.findByText(/recaptcha-error: 403 Forbidden/i)
    ).toBeInTheDocument();
  });

  it("points an unenrolled account at enrolment instead of a dead Verify button", async () => {
    // Regression: with no factor configured the banner offered a Verify button,
    // but the form only renders for needs-code, so clicking it did nothing and
    // said nothing. An admin who had never enrolled had no way forward.
    vi.mocked(getMfaSessionStatus).mockResolvedValue({
      ...BASE_STATUS,
      methods: [],
    });

    renderGate();

    expect(await screen.findByText(/no second factor yet/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /set up a second factor/i })
    ).toHaveAttribute("href", "/admin/security");
    expect(screen.queryByRole("button", { name: "Verify" })).not.toBeInTheDocument();
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
  });

  it("re-runs the page data once the session is elevated", async () => {
    // Every admin page fetches on mount, and those fetches failed while the
    // session was not elevated. The gate used to flip its own banner to
    // "elevated" and stop there, so the screen stayed empty until the operator
    // refreshed the page by hand.
    let mounts = 0;

    function Page() {
      mounts += 1;
      return <p>page</p>;
    }

    vi.mocked(getMfaSessionStatus).mockResolvedValue({
      ...BASE_STATUS,
      methods: ["totp"],
    });
    vi.mocked(startMfaSession).mockResolvedValue({
      expiresAt: 456,
      method: "totp",
    });

    render(<AdminMfaGate><Page /></AdminMfaGate>);

    expect(mounts).toBe(1);

    fireEvent.click(await screen.findByRole("button", { name: "Verify" }));
    fireEvent.change(screen.getByPlaceholderText("6-digit code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => expect(mounts).toBe(2));
  });

});
