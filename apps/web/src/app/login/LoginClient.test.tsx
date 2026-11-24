// @vitest-environment happy-dom

/**
 * The login screen owns two failure branches that both left real users stuck:
 *
 *  - An unverified account must be sent a fresh verification email and routed
 *    to /verify-email, *not* to the dashboard, where every API call 403s. This
 *    has to hold even when the verification email itself fails to send.
 *  - App Check enforcement on Identity Toolkit rejects every provider before
 *    credentials are checked. Reported as a generic auth failure it reads like
 *    a Google misconfiguration, so it gets its own message and must not be
 *    treated as a retryable popup problem.
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  initializeRecaptchaConfig: vi.fn(),
  getAppCheckToken: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  sendEmailVerification: vi.fn(),
  signInWithRedirect: vi.fn(),
  signInWithPopup: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  searchParams: new URLSearchParams(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  ensureUserProfile: vi.fn(),
  createUserProfile: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({
  auth: { name: "test-auth" },
  getAppCheckToken: (...args: unknown[]) => h.getAppCheckToken(...args),
}));

vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: class GoogleAuthProvider {
    static credential(idToken: string) {
      return { providerId: "google.com", idToken };
    }
  },
  initializeRecaptchaConfig: (...args: unknown[]) =>
    h.initializeRecaptchaConfig(...args),
  signInWithEmailAndPassword: (...args: unknown[]) =>
    h.signInWithEmailAndPassword(...args),
  createUserWithEmailAndPassword: (...args: unknown[]) =>
    h.createUserWithEmailAndPassword(...args),
  sendEmailVerification: (...args: unknown[]) =>
    h.sendEmailVerification(...args),
  signInWithRedirect: (...args: unknown[]) => h.signInWithRedirect(...args),
  signInWithPopup: (...args: unknown[]) => h.signInWithPopup(...args),
  sendPasswordResetEmail: (...args: unknown[]) =>
    h.sendPasswordResetEmail(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace, refresh: h.refresh }),
  useSearchParams: () => ({ get: (key: string) => h.searchParams.get(key) }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: unknown; children: unknown }) =>
    React.createElement(
      "a",
      { href: String(href) },
      children as React.ReactNode
    ),
}));

// The real helper reaches Google Fonts at build time; the variable name is all
// the component uses.
vi.mock("next/font/google", () => ({
  Bricolage_Grotesque: () => ({ variable: "font-display" }),
}));

// happy-dom has no compositor, so motion's animation loop throws on unmount.
vi.mock("framer-motion", () => {
  // Pulls motion-only props out so React does not warn about unknown ones.
  const strip = ({
    children: _children,
    ...rest
  }: { children?: React.ReactNode } & Record<string, unknown>) => {
    void _children;
    const { custom, variants, initial, animate, ...domProps } = rest;
    void custom;
    void variants;
    void initial;
    void animate;
    return domProps;
  };

  return {
    motion: {
      div: (props: { children?: React.ReactNode } & Record<string, unknown>) =>
        React.createElement("div", strip(props), props.children),
      p: (props: { children?: React.ReactNode } & Record<string, unknown>) =>
        React.createElement("p", strip(props), props.children),
    },
  };
});

vi.mock("sonner", () => ({
  toast: { success: h.success, error: h.error, info: h.info },
}));

// Imported dynamically by the component, so this also has to be a module mock.
vi.mock("@/features/users/services/userProfile", () => ({
  ensureUserProfile: (...args: unknown[]) => h.ensureUserProfile(...args),
  createUserProfile: (...args: unknown[]) => h.createUserProfile(...args),
}));

import LoginClient from "./LoginClient";

const profile = (overrides: Record<string, unknown> = {}) => ({
  uid: "user-1",
  email: "ada@example.com",
  emailVerified: false,
  displayName: null,
  photoURL: null,
  ...overrides,
});

let consoleSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

/** A login-intent gate response, with Retry-After only when given. */
const gateResponse = (status: number, retryAfter?: string) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {
    get: (name: string) =>
      name.toLowerCase() === "retry-after" ? (retryAfter ?? null) : null,
  },
});

beforeEach(() => {
  h.initializeRecaptchaConfig.mockReset().mockResolvedValue(undefined);
  h.getAppCheckToken.mockReset().mockResolvedValue(null);
  h.signInWithEmailAndPassword.mockReset();
  h.createUserWithEmailAndPassword.mockReset();
  h.sendEmailVerification.mockReset().mockResolvedValue(undefined);
  h.signInWithRedirect.mockReset();
  h.signInWithPopup.mockReset();
  h.sendPasswordResetEmail.mockReset().mockResolvedValue(undefined);
  h.replace.mockReset();
  h.refresh.mockReset();
  h.success.mockReset();
  h.error.mockReset();
  h.info.mockReset();
  h.ensureUserProfile
    .mockReset()
    .mockResolvedValue({ uid: "user-1", role: "customer" });
  h.createUserProfile.mockReset().mockResolvedValue(undefined);
  h.searchParams = new URLSearchParams();
  h.fetch.mockReset().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => null },
  });
  vi.stubGlobal("fetch", h.fetch);
  consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  consoleSpy.mockRestore();
  warnSpy.mockRestore();
  vi.unstubAllGlobals();
});

/** Fill in credentials. The card always shows the email form. */
function fillEmailForm(email = "ada@example.com", password = "secret-pass") {
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: password },
  });
}

function submitEmailForm() {
  fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
}

/** Switch to the registration form and fill it in. */
function fillRegisterForm(password: string, email = "new@example.com") {
  fireEvent.click(screen.getByRole("button", { name: /sign up/i }));
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: password },
  });
  // Registration requires an explicit 18+ / policy acceptance. A real browser
  // refuses to submit the form until it is ticked, so the helper ticks it just
  // as a person would; the assertions in these tests are about password rules.
  fireEvent.click(screen.getByRole("checkbox"));
}

function submitRegisterForm() {
  fireEvent.click(screen.getByRole("button", { name: /^create account$/i }));
}

/**
 * The leak check hashes the password with `crypto.subtle` and sends only the
 * first 5 hex characters, so the test has to know what the hash will be. The
 * digest is stubbed to fixed bytes and the expected hex is derived from the same
 * bytes, which keeps the assertion about the k-anonymity split rather than
 * about SHA-1.
 */
const DIGEST_BYTES = new Uint8Array([
  0xde, 0xad, 0xbe, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef, 0x10,
  0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80,
]);

const DIGEST_HEX = Array.from(DIGEST_BYTES)
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("")
  .toUpperCase();

function stubSubtleDigest() {
  vi.stubGlobal("crypto", {
    subtle: { digest: vi.fn(async () => DIGEST_BYTES.buffer) },
  });
}

/** Routes each fetch the registration path makes. */
function mockRegistrationFetch(
  leakResponse: { ok: boolean; status: number; suffixes?: string[] } | "throw"
) {
  h.fetch.mockImplementation(async (input: unknown) => {
    const url = String(input);

    if (url.includes("/api/auth/login-intent")) return gateResponse(200);

    if (url.includes("/api/auth/password-leak-check")) {
      if (leakResponse === "throw") throw new TypeError("fetch failed");
      return {
        ok: leakResponse.ok,
        status: leakResponse.status,
        json: async () => ({ suffixes: leakResponse.suffixes ?? [] }),
      };
    }

    throw new Error(`unexpected fetch: ${url}`);
  });
}

describe("LoginClient: unverified email", () => {
  it("sends a verification email and routes to the verify screen", async () => {
    h.signInWithEmailAndPassword.mockResolvedValue({ user: profile() });
    render(<LoginClient />);
    fillEmailForm();
    submitEmailForm();

    await waitFor(() =>
      expect(h.replace).toHaveBeenCalledWith("/verify-email")
    );

    expect(h.sendEmailVerification).toHaveBeenCalledTimes(1);
    expect(h.success).toHaveBeenCalledWith(
      "We sent a verification email. Please check your inbox."
    );
    // The dashboard would 403 every request for an unverified account.
    expect(h.ensureUserProfile).not.toHaveBeenCalled();
    expect(h.refresh).toHaveBeenCalled();
  });

  it("still routes to the verify screen when the email cannot be sent", async () => {
    h.signInWithEmailAndPassword.mockResolvedValue({ user: profile() });
    h.sendEmailVerification.mockRejectedValue(new Error("smtp down"));
    render(<LoginClient />);
    fillEmailForm();
    submitEmailForm();

    // Firebase only rate-limits; the account still cannot enter the dashboard,
    // so a failed send must not become a failed sign-in.
    await waitFor(() =>
      expect(h.replace).toHaveBeenCalledWith("/verify-email")
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "Failed to send verification email:",
      expect.anything()
    );
    expect(h.ensureUserProfile).not.toHaveBeenCalled();
  });

  it("routes a verified account to the dashboard instead", async () => {
    h.signInWithEmailAndPassword.mockResolvedValue({
      user: profile({ emailVerified: true }),
    });
    render(<LoginClient />);
    fillEmailForm();
    submitEmailForm();

    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/dashboard"));
    expect(h.sendEmailVerification).not.toHaveBeenCalled();
    expect(h.ensureUserProfile).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "user-1" })
    );
  });
});

describe("LoginClient: registration checks", () => {
  it("rejects a password that misses the policy before any network call", async () => {
    render(<LoginClient />);
    fillRegisterForm("short");
    submitRegisterForm();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("at least 8 characters");
    expect(alert).toHaveTextContent("one uppercase letter");
    expect(alert).toHaveTextContent("one special character");
    // Validation is local on purpose: nothing is created and nothing is sent.
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.createUserWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it("never creates an account for a blocklisted password", async () => {
    render(<LoginClient />);
    // "iloveyou" is on the common-password list, and the strength rules reject
    // it first — this locks in that no account is created either way, and that
    // a listed password never reaches the leak check.
    fillRegisterForm("iloveyou");
    submitRegisterForm();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Password must include"
    );
    expect(h.createUserWithEmailAndPassword).not.toHaveBeenCalled();
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("blocks a password found in a breach", async () => {
    stubSubtleDigest();
    // The server returns suffixes after the 5-character prefix; a hit means the
    // full hash is in the dump.
    mockRegistrationFetch({
      ok: true,
      status: 200,
      suffixes: [DIGEST_HEX.slice(5)],
    });
    render(<LoginClient />);
    fillRegisterForm("Str0ng!pass");
    submitRegisterForm();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("appeared in a data breach");
    expect(h.createUserWithEmailAndPassword).not.toHaveBeenCalled();

    // Only the prefix leaves the browser: the full password never does.
    const body = JSON.parse(
      (
        h.fetch.mock.calls.find(([url]) =>
          String(url).includes("password-leak-check")
        )?.[1] as { body: string }
      ).body
    );
    expect(body).toEqual({ prefix: DIGEST_HEX.slice(0, 5) });
  });

  it("registers when the password is not in any breach", async () => {
    stubSubtleDigest();
    mockRegistrationFetch({
      ok: true,
      status: 200,
      suffixes: ["FFFFFFFFFFFF"],
    });
    h.createUserWithEmailAndPassword.mockResolvedValue({ user: profile() });
    render(<LoginClient />);
    fillRegisterForm("Str0ng!pass");
    submitRegisterForm();

    await waitFor(() =>
      expect(h.createUserWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        "new@example.com",
        "Str0ng!pass"
      )
    );
    expect(h.createUserProfile).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ email: "new@example.com" })
    );
    // New accounts are unverified, so they land on the verify screen.
    await waitFor(() =>
      expect(h.replace).toHaveBeenCalledWith("/verify-email")
    );
  });

  it("still registers when the leak check is unavailable", async () => {
    stubSubtleDigest();
    mockRegistrationFetch({ ok: false, status: 503 });
    h.createUserWithEmailAndPassword.mockResolvedValue({ user: profile() });
    render(<LoginClient />);
    fillRegisterForm("Str0ng!pass");
    submitRegisterForm();

    // Fail open: an outage in the breach service must not stop sign-ups, and
    // the strength rules above still applied.
    await waitFor(() =>
      expect(h.createUserWithEmailAndPassword).toHaveBeenCalled()
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Password leak check unavailable")
    );
  });

  it("still registers when the leak check cannot be reached", async () => {
    stubSubtleDigest();
    mockRegistrationFetch("throw");
    h.createUserWithEmailAndPassword.mockResolvedValue({ user: profile() });
    render(<LoginClient />);
    fillRegisterForm("Str0ng!pass");
    submitRegisterForm();

    await waitFor(() =>
      expect(h.createUserWithEmailAndPassword).toHaveBeenCalled()
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "Password leak check failed:",
      expect.anything()
    );
  });
});

describe("LoginClient: rate-limit gate", () => {
  it("blocks sign-in for the delay the gate asks for", async () => {
    h.fetch.mockResolvedValueOnce(gateResponse(429, "120"));
    render(<LoginClient />);
    fillEmailForm();
    submitEmailForm();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Too many sign-in attempts. Try again in 120s."
    );
    expect(h.error).toHaveBeenCalledWith(
      "Too many sign-in attempts. Try again in 120s."
    );
    // The gate runs before Firebase on purpose: a blocked attempt must never
    // reach credential checking, or the rate limit only slows the attacker's
    // response time, not the attempt itself.
    expect(h.signInWithEmailAndPassword).not.toHaveBeenCalled();
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("falls back to a minute when the gate omits Retry-After", async () => {
    h.fetch.mockResolvedValueOnce(gateResponse(429));
    render(<LoginClient />);
    fillEmailForm();
    submitEmailForm();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many sign-in attempts. Try again in 60s."
    );
    expect(h.signInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it("never reports a zero-second wait", async () => {
    h.fetch.mockResolvedValueOnce(gateResponse(429, "0"));
    render(<LoginClient />);
    fillEmailForm();
    submitEmailForm();

    // "Try again in 0s" would read as "retry now", which the gate will reject.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many sign-in attempts. Try again in 1s."
    );
  });

  it("lets the attempt through when the gate itself is unhealthy", async () => {
    h.fetch.mockResolvedValueOnce(gateResponse(500));
    h.signInWithEmailAndPassword.mockResolvedValue({ user: profile() });
    render(<LoginClient />);
    fillEmailForm();
    submitEmailForm();

    // Only a real 429 blocks. Otherwise sign-in would depend on the rate-limit
    // infrastructure being up, which took the whole login page down once.
    await waitFor(() =>
      expect(h.replace).toHaveBeenCalledWith("/verify-email")
    );
    expect(h.signInWithEmailAndPassword).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("continuing"));
  });

  it("lets the attempt through when the gate cannot be reached", async () => {
    h.fetch.mockRejectedValueOnce(new TypeError("fetch failed"));
    h.signInWithEmailAndPassword.mockResolvedValue({ user: profile() });
    render(<LoginClient />);
    fillEmailForm();
    submitEmailForm();

    await waitFor(() =>
      expect(h.replace).toHaveBeenCalledWith("/verify-email")
    );
    expect(h.signInWithEmailAndPassword).toHaveBeenCalledTimes(1);
  });
});

describe("LoginClient: sign-in warm-up", () => {
  it("pre-mints the App Check token and reCAPTCHA config on mount", async () => {
    // Both are lazy in the SDK; paying them at click time added 2-3s to
    // "Continue with Google" — long enough for users to click again and trip
    // the rate limiter. Warming them while the page is interactive makes the
    // click navigate immediately.
    render(<LoginClient />);

    await waitFor(() => expect(h.getAppCheckToken).toHaveBeenCalledTimes(1));
    expect(h.initializeRecaptchaConfig).toHaveBeenCalledWith(
      expect.objectContaining({ name: "test-auth" })
    );
  });
});

describe("LoginClient: Google popup flow", () => {
  it("opens a popup from the Continue with Google button", async () => {
    h.signInWithPopup.mockResolvedValue({
      user: profile({ emailVerified: true }),
    });
    render(<LoginClient />);

    fireEvent.click(
      screen.getByRole("button", { name: /continue with google/i })
    );

    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/dashboard"));
    expect(h.signInWithPopup).toHaveBeenCalledWith(
      { name: "test-auth" },
      expect.anything()
    );
    // The button and the auto-prompt are independent paths.
    expect(h.signInWithRedirect).not.toHaveBeenCalled();
  });

  it("shows the interstitial only after the account is picked, not at click", async () => {
    let settlePopup: (value: { user: unknown }) => void = () => {};
    h.signInWithPopup.mockReturnValue(
      new Promise((resolve) => {
        settlePopup = resolve;
      })
    );
    render(<LoginClient />);

    fireEvent.click(
      screen.getByRole("button", { name: /continue with google/i })
    );

    // While the chooser is open the form stays visible (button spinner only):
    // loader → chooser → loader read as the page flickering.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    settlePopup({ user: profile({ emailVerified: true }) });
    // Once the account is picked, the interstitial covers the page for the
    // profile work and the ride to the dashboard.
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/signing you in/i)
    );
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/dashboard"));
  });

  it("treats a closed chooser as a cancellation, not an error", async () => {
    h.signInWithPopup.mockRejectedValue({ code: "auth/popup-closed-by-user" });
    render(<LoginClient />);

    fireEvent.click(
      screen.getByRole("button", { name: /continue with google/i })
    );

    // No spinner left behind and no failure message for changing one's mind.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /continue with google/i })
      ).not.toBeDisabled()
    );
    expect(h.error).not.toHaveBeenCalled();
    expect(h.signInWithRedirect).not.toHaveBeenCalled();
    // The interstitial is gone and the form is back.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("falls back to a redirect when the popup is blocked", async () => {
    h.signInWithPopup.mockRejectedValue({ code: "auth/popup-blocked" });
    h.signInWithRedirect.mockResolvedValue(undefined);
    render(<LoginClient />);

    fireEvent.click(
      screen.getByRole("button", { name: /continue with google/i })
    );

    await waitFor(() =>
      expect(h.signInWithRedirect).toHaveBeenCalledWith(
        { name: "test-auth" },
        expect.anything()
      )
    );
    expect(h.error).not.toHaveBeenCalled();
    // The return trip is marked so the interstitial renders instead of the
    // login form flashing back mid-sign-in.
    expect(sessionStorage.getItem("shipin:auth-redirect-pending")).toBe("1");
  });
});

describe("LoginClient: forgot password", () => {
  it("sends a reset email to the address in the email field", async () => {
    render(<LoginClient />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ada@example.com" },
    });

    fireEvent.click(screen.getByRole("button", { name: /forgot password/i }));

    await waitFor(() =>
      expect(h.sendPasswordResetEmail).toHaveBeenCalledWith(
        { name: "test-auth" },
        "ada@example.com",
        expect.anything()
      )
    );
    // The reply must not reveal whether the account exists.
    expect(h.success).toHaveBeenCalledWith(
      expect.stringMatching(/reset link is on its way/)
    );
    expect(h.error).not.toHaveBeenCalled();
  });

  it("asks for an email first instead of sending to nothing", async () => {
    render(<LoginClient />);

    fireEvent.click(screen.getByRole("button", { name: /forgot password/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/enter your email/i);
    expect(h.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("never turns a reset failure into an account-existence hint", async () => {
    h.sendPasswordResetEmail.mockRejectedValue({ code: "auth/user-not-found" });
    render(<LoginClient />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "nobody@example.com" },
    });

    fireEvent.click(screen.getByRole("button", { name: /forgot password/i }));

    await waitFor(() =>
      expect(h.success).toHaveBeenCalledWith(
        expect.stringMatching(/reset link is on its way/)
      )
    );
    expect(h.error).not.toHaveBeenCalled();
  });
});

describe("LoginClient: App Check errors", () => {
  it("explains a Google sign-in blocked by App Check", async () => {
    h.signInWithPopup.mockRejectedValue({
      code: "auth/firebase-app-check-token-is-invalid",
    });
    render(<LoginClient />);

    fireEvent.click(
      screen.getByRole("button", { name: /continue with google/i })
    );

    await waitFor(() =>
      expect(h.error).toHaveBeenCalledWith(expect.stringContaining("App Check"))
    );
    expect(h.error).toHaveBeenCalledWith(
      expect.stringContaining(
        "administrator must disable App Check enforcement"
      )
    );
    // App Check rejects the popup sign-in itself; there is no retry that
    // could fix it from the client, so the user must not be sent around again.
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("shows the App Check message inline for email sign-in", async () => {
    h.signInWithEmailAndPassword.mockRejectedValue({
      code: "auth/app-check-token-invalid",
    });
    render(<LoginClient />);
    fillEmailForm();
    submitEmailForm();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("App Check");
    expect(h.error).toHaveBeenCalledWith(expect.stringContaining("App Check"));
    expect(h.replace).not.toHaveBeenCalled();
    // The form stays usable so an admin can be asked to fix the project.
    expect(
      screen.getByRole("button", { name: /^continue$/i })
    ).not.toBeDisabled();
  });

  it("points the unauthorized-domain error at the documentation", async () => {
    h.signInWithPopup.mockRejectedValue({ code: "auth/unauthorized-domain" });
    render(<LoginClient />);

    fireEvent.click(
      screen.getByRole("button", { name: /continue with google/i })
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/isn't authorized/i);
    // Names the setting rather than only sending the user to support.
    expect(alert).toHaveTextContent(/Authorized domains/);
    expect(alert).toHaveTextContent(/preview deployment/i);

    const link = screen.getByRole("link", {
      name: /authorized domains documentation/i,
    });
    expect(link).toHaveAttribute(
      "href",
      "https://support.google.com/firebase/answer/6400741"
    );
    expect(link).toHaveAttribute("target", "_blank");
    // Opened in a new tab, so the opener reference has to go.
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(h.error).toHaveBeenCalledWith(
      expect.stringContaining("Authorized domains")
    );
  });

  it("drops the documentation link on the next failure", async () => {
    h.signInWithPopup.mockRejectedValue({ code: "auth/unauthorized-domain" });
    render(<LoginClient />);

    fireEvent.click(
      screen.getByRole("button", { name: /continue with google/i })
    );
    await screen.findByRole("link", {
      name: /authorized domains documentation/i,
    });

    h.signInWithPopup.mockRejectedValue({ code: "auth/network-request-failed" });
    fireEvent.click(
      screen.getByRole("button", { name: /continue with google/i })
    );

    // A cancelled sign-in clears the inline error rather than leaving the
    // previous one on screen, and a stale link next to an unrelated failure
    // would send the user down the wrong path.
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(
      screen.queryByRole("link", { name: /authorized domains documentation/i })
    ).toBeNull();
  });

  it("clears the documentation link when a validation error replaces it", async () => {
    h.signInWithPopup.mockRejectedValue({ code: "auth/unauthorized-domain" });
    render(<LoginClient />);

    fireEvent.click(
      screen.getByRole("button", { name: /continue with google/i })
    );
    await screen.findByRole("link", {
      name: /authorized domains documentation/i,
    });

    // Fall back to email sign-in and fail: the inline error now says something
    // else, so the domains link has to go with the old message. (Submitting the
    // form empty would not work here: the inputs are `required`, so the browser
    // blocks the submit before any handler runs.)
    h.signInWithEmailAndPassword.mockRejectedValue({
      code: "auth/invalid-credential",
    });
    fillEmailForm();
    submitEmailForm();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /incorrect email or password/i
      )
    );
    expect(
      screen.queryByRole("link", { name: /authorized domains documentation/i })
    ).toBeNull();
  });

  it("keeps ordinary credential failures out of the App Check message", async () => {
    h.signInWithEmailAndPassword.mockRejectedValue({
      code: "auth/invalid-credential",
    });
    render(<LoginClient />);
    fillEmailForm();
    submitEmailForm();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Incorrect email or password.");
    expect(alert).not.toHaveTextContent("App Check");
  });
});
