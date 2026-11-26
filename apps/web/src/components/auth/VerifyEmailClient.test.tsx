// @vitest-environment happy-dom
import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The screen owns three behaviours worth locking down: the resend button (and
 * its inline failure message), the 5-second poll that notices a link clicked in
 * another tab, and the "I verified my email" guard that must not navigate on
 * stale client state.
 */
const h = vi.hoisted(() => ({
  currentUser: null as null | {
    email: string | null;
    emailVerified: boolean;
    getIdToken: (forceRefresh?: boolean) => Promise<string>;
  },
  requestVerificationResend: vi.fn(),
  reload: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({
  get auth() {
    return { currentUser: h.currentUser };
  },
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, callback: (user: unknown) => void) => {
    // Mirrors Firebase: the listener fires immediately with the current user.
    void callback(h.currentUser);
    return () => {};
  },
  reload: (...args: unknown[]) => h.reload(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace, refresh: h.refresh }),
}));

// Next's Link needs an app-router context that a unit test does not have.
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: unknown; children: unknown }) =>
    React.createElement(
      "a",
      { href: String(href) },
      children as React.ReactNode
    ),
}));

// The resend path goes through the server endpoint; the Firebase SDK is no longer
// involved, so the helper is what the screen calls.
vi.mock("@/lib/emailVerification", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/emailVerification")>();
  return {
    ...actual,
    requestVerificationResend: (...args: unknown[]) =>
      h.requestVerificationResend(...args),
  };
});

vi.mock("sonner", () => ({
  toast: { success: h.success, error: h.error },
}));

// happy-dom has no compositor: motion's animation loop throws "The animation was
// canceled" as an unhandled rejection when the card unmounts, failing the run
// even though every assertion passed. Render a plain div instead.
vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      ...rest
    }: { children?: React.ReactNode } & Record<string, unknown>) => {
      const { custom, variants, initial, animate, ...domProps } = rest;
      void custom;
      void variants;
      void initial;
      void animate;
      return React.createElement("div", domProps, children);
    },
  },
}));

import VerifyEmailClient from "./VerifyEmailClient";

function user(emailVerified: boolean, email = "ada@example.com") {
  const profile = {
    email,
    emailVerified,
    getIdToken: vi.fn(async () => "id-token"),
  };
  h.currentUser = profile;
  return profile;
}

beforeEach(() => {
  h.currentUser = null;
  h.requestVerificationResend
    .mockReset()
    .mockResolvedValue({ status: "sent" as const });
  h.reload.mockReset().mockResolvedValue(undefined);
  h.replace.mockReset();
  h.refresh.mockReset();
  h.success.mockReset();
  h.error.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("VerifyEmailClient: resend", () => {
  it("asks the server to send the email and confirms it", async () => {
    user(false);
    render(<VerifyEmailClient />);

    fireEvent.click(
      await screen.findByRole("button", { name: /resend email/i })
    );

    await waitFor(() =>
      expect(h.requestVerificationResend).toHaveBeenCalledTimes(1)
    );
    // The endpoint authenticates with the user's own token.
    expect(h.requestVerificationResend).toHaveBeenCalledWith("id-token");
    expect(h.success).toHaveBeenCalledWith(
      "Verification email sent. Please check your inbox."
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the server's cooldown inline and disables the button", async () => {
    user(false);
    h.requestVerificationResend.mockResolvedValue({
      status: "too-soon" as const,
      retryAfter: 60,
      message: "Wait 60s before requesting another email.",
    });
    render(<VerifyEmailClient />);

    fireEvent.click(
      await screen.findByRole("button", { name: /resend email/i })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Wait 60s before requesting another email."
    );
    // A toast alone was too easy to miss next to the heading.
    expect(h.error).not.toHaveBeenCalled();
    // Resending inside the window would only be refused again, so the button
    // reports the wait instead of inviting another failure.
    expect(
      screen.getByRole("button", { name: /try again in \d+s/i })
    ).toBeDisabled();
    expect(screen.queryByRole("button", { name: /resend email/i })).toBeNull();
  });

  it("re-enables resend when the cooldown elapses", async () => {
    vi.useFakeTimers();
    user(false);
    h.requestVerificationResend.mockResolvedValueOnce({
      status: "too-soon" as const,
      retryAfter: 60,
      message: "Wait 60s before requesting another email.",
    });
    render(<VerifyEmailClient />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    fireEvent.click(screen.getByRole("button", { name: /resend email/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(
      screen.getByRole("button", { name: /try again in 60s/i })
    ).toBeDisabled();

    // The countdown ticks down rather than jumping straight back to enabled.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(
      screen.getByRole("button", { name: /try again in 30s/i })
    ).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    const button = screen.getByRole("button", { name: /resend email/i });
    expect(button).not.toBeDisabled();

    // The retry it invites must actually work, not just be clickable.
    fireEvent.click(button);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(h.requestVerificationResend).toHaveBeenCalledTimes(2);
    expect(h.success).toHaveBeenCalled();
  });

  it("treats an already-verified answer as done, and reloads the record", async () => {
    user(false);
    h.requestVerificationResend.mockResolvedValue({
      status: "already-verified" as const,
    });
    render(<VerifyEmailClient />);

    fireEvent.click(
      await screen.findByRole("button", { name: /resend email/i })
    );

    // Verified in another tab or by support: nothing failed, so no inline error.
    await waitFor(() =>
      expect(h.success).toHaveBeenCalledWith(
        "This email address is already verified."
      )
    );
    expect(h.reload).toHaveBeenCalledWith(h.currentUser);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows a send failure inline rather than only in the console", async () => {
    user(false);
    h.requestVerificationResend.mockResolvedValue({
      status: "failed" as const,
      message: "We could not send the verification email. Please try again.",
    });
    render(<VerifyEmailClient />);

    fireEvent.click(
      await screen.findByRole("button", { name: /resend email/i })
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "We could not send the verification email. Please try again."
    );
    expect(h.error).not.toHaveBeenCalled();
  });

  it("still reports a thrown failure instead of leaving the button silent", async () => {
    user(false);
    // What an unexpected throw (or a token that cannot be minted) looks like.
    h.requestVerificationResend.mockRejectedValue(new Error("token expired"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<VerifyEmailClient />);

    fireEvent.click(
      await screen.findByRole("button", { name: /resend email/i })
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "We could not send the verification email. Please try again."
    );
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe("VerifyEmailClient: polling", () => {
  it("does not poll before the 5 second interval elapses", async () => {
    vi.useFakeTimers();
    user(false);

    render(<VerifyEmailClient />);
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999);
    });

    expect(h.reload).not.toHaveBeenCalled();
  });

  it("detects verification and refreshes the ID token", async () => {
    vi.useFakeTimers();
    const profile = user(false);

    render(<VerifyEmailClient />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Check your email")).toBeInTheDocument();

    // The link was opened in another tab: only the server knows.
    profile.emailVerified = true;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(h.reload).toHaveBeenCalledWith(profile);
    expect(screen.getByText("Email verified!")).toBeInTheDocument();
    // Without the forced refresh the dashboard would 403 on stale claims.
    expect(profile.getIdToken).toHaveBeenCalledWith(true);
  });

  it("keeps waiting while the email is still unverified", async () => {
    vi.useFakeTimers();
    const profile = user(false);

    render(<VerifyEmailClient />);
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(h.reload).toHaveBeenCalled();
    expect(screen.queryByText("Email verified!")).toBeNull();
    expect(profile.getIdToken).not.toHaveBeenCalled();
  });

  it("stops polling once the user continues to the dashboard", async () => {
    vi.useFakeTimers();
    const profile = user(false);
    h.reload.mockImplementation(async () => {
      profile.emailVerified = true;
    });

    render(<VerifyEmailClient />);
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(
      screen.getByRole("button", { name: /i verified my email/i })
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(h.replace).toHaveBeenCalledWith("/dashboard");
    const reloadsBeforeLeaving = h.reload.mock.calls.length;

    // The interval must die with the navigation, not with the unmount: a tick
    // in between would reload a page the user has already left.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(h.reload).toHaveBeenCalledTimes(reloadsBeforeLeaving);
  });

  it("does not poll after the screen unmounts", async () => {
    vi.useFakeTimers();
    user(false);

    const { unmount } = render(<VerifyEmailClient />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Check your email")).toBeInTheDocument();

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(h.reload).not.toHaveBeenCalled();
  });

  it("survives a reload failure and keeps the screen usable", async () => {
    vi.useFakeTimers();
    const profile = user(false);
    h.reload.mockRejectedValue(new Error("offline"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<VerifyEmailClient />);
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(screen.getByText("Check your email")).toBeInTheDocument();
    expect(h.reload).toHaveBeenCalledWith(profile);
    // A failed reload must not be mistaken for a successful verification.
    expect(profile.getIdToken).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe("VerifyEmailClient: Continue guard", () => {
  it("refuses to navigate while the account is still unverified", async () => {
    user(false);
    render(<VerifyEmailClient />);

    fireEvent.click(
      await screen.findByRole("button", { name: /i verified my email/i })
    );

    // It reloads first, in case the link was clicked in another tab.
    await waitFor(() => expect(h.reload).toHaveBeenCalled());
    expect(h.error).toHaveBeenCalledWith("Please verify your email first.");
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("navigates once a reload reveals the email is verified", async () => {
    const profile = user(false);
    h.reload.mockImplementation(async () => {
      profile.emailVerified = true;
    });
    render(<VerifyEmailClient />);

    fireEvent.click(
      await screen.findByRole("button", { name: /i verified my email/i })
    );

    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/dashboard"));
    expect(profile.getIdToken).toHaveBeenCalledWith(true);
    expect(h.refresh).toHaveBeenCalled();
  });

  it("navigates straight away when the token already says verified", async () => {
    const profile = user(true);
    render(<VerifyEmailClient />);

    fireEvent.click(
      await screen.findByRole("button", { name: /continue to dashboard/i })
    );

    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/dashboard"));
    expect(profile.getIdToken).toHaveBeenCalledWith(true);
    expect(h.reload).not.toHaveBeenCalled();
  });

  it("asks a signed-out visitor to sign in again", async () => {
    h.currentUser = null;
    render(<VerifyEmailClient />);

    // No session means the screen redirects to /login before any button exists.
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/login"));
  });
});
