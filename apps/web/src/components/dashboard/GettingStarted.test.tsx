// @vitest-environment happy-dom
/**
 * The first-run checklist must only appear while something is actually left to
 * do, and must stay dismissed once the customer dismisses it.
 *
 * Both halves matter: a checklist that never disappears is clutter, and one
 * that reappears after dismissal (or after a reload) teaches the customer that
 * dismissing things does not work.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const authState = vi.hoisted(() => ({
  emailVerified: false,
  listeners: [] as ((user: unknown) => void)[],
}));

vi.mock("@/lib/firebase", () => ({ auth: {} }));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, listener: (user: unknown) => void) => {
    authState.listeners.push(listener);
    listener(
      authState.emailVerified ? { emailVerified: true } : { emailVerified: false }
    );

    return () => {
      authState.listeners = authState.listeners.filter((l) => l !== listener);
    };
  },
}));

import GettingStarted, {
  GETTING_STARTED_DISMISSED_KEY,
} from "./GettingStarted";

beforeEach(() => {
  authState.emailVerified = false;
  authState.listeners = [];
  window.localStorage.clear();
});

describe("GettingStarted", () => {
  it("lists the three steps and counts those left", async () => {
    render(<GettingStarted hasRequests={false} />);

    await waitFor(() =>
      expect(screen.getByTestId("getting-started")).toBeInTheDocument()
    );

    expect(screen.getByText("Verify your email")).toBeInTheDocument();
    expect(screen.getByText("Add a shipping address")).toBeInTheDocument();
    expect(screen.getByText("Create your first request")).toBeInTheDocument();
    expect(screen.getByText("3 steps left before your first order can move."))
      .toBeInTheDocument();
  });

  it("crosses off the steps the account has already completed", async () => {
    authState.emailVerified = true;

    render(<GettingStarted hasRequests={false} />);

    await waitFor(() =>
      expect(screen.getByText("Verify your email")).toHaveClass("line-through")
    );
    expect(screen.getByText("Create your first request")).not.toHaveClass(
      "line-through"
    );
  });

  it("disappears once the account is verified and has a request", async () => {
    authState.emailVerified = true;

    render(<GettingStarted hasRequests />);

    await waitFor(() =>
      expect(screen.queryByTestId("getting-started")).not.toBeInTheDocument()
    );
  });

  it("stays dismissed after the customer dismisses it", async () => {
    render(<GettingStarted hasRequests={false} />);

    await waitFor(() =>
      expect(screen.getByTestId("getting-started")).toBeInTheDocument()
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss getting started" })
    );

    expect(screen.queryByTestId("getting-started")).not.toBeInTheDocument();
    expect(
      window.localStorage.getItem(GETTING_STARTED_DISMISSED_KEY)
    ).toBe("1");
  });

  it("does not come back on the next load", async () => {
    window.localStorage.setItem(GETTING_STARTED_DISMISSED_KEY, "1");

    render(<GettingStarted hasRequests={false} />);

    // Give the mount effect a turn: the checklist must never paint.
    await waitFor(() => expect(authState.listeners.length).toBeGreaterThan(0));
    expect(screen.queryByTestId("getting-started")).not.toBeInTheDocument();
  });
});
