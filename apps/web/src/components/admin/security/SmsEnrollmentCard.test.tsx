// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { MfaConfigStatus } from "@/lib/mfaSetupClient";

/**
 * SMS is announced, not offered.
 *
 * These assertions are about what a person sees and can do: a "Coming soon" badge, an
 * explanation of what to use instead, and no control that would start a ceremony the
 * deployment cannot finish.
 */

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as unknown },
  startSmsEnrollment: vi.fn(),
  confirmSmsEnrollment: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({ auth: mocks.auth }));

vi.mock("@/lib/firebaseMfa", () => ({
  FirebaseMfaError: class extends Error {},
  RECAPTCHA_CONTAINER_ID: "mfa-recaptcha",
  startSmsEnrollment: mocks.startSmsEnrollment,
  confirmSmsEnrollment: mocks.confirmSmsEnrollment,
}));

const { default: SmsEnrollmentCard } = await import("./SmsEnrollmentCard");

function statusWith(overrides: Partial<MfaConfigStatus["sms"]> = {}) {
  return {
    totp: { enabled: true, pending: false },
    sms: { enabled: false, phoneNumber: null, ...overrides },
    backupCodes: 10,
  } as MfaConfigStatus;
}

beforeEach(() => {
  mocks.startSmsEnrollment.mockReset();
  mocks.confirmSmsEnrollment.mockReset();
});

describe("SmsEnrollmentCard", () => {
  it("says the feature is coming instead of offering it", () => {
    render(<SmsEnrollmentCard status={statusWith()} onChanged={vi.fn()} />);

    expect(screen.getByText("SMS codes")).toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(screen.getByText(/no codes are sent until it launches/i)).toBeVisible();
    // The card must not promise an enrolment that cannot complete.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(mocks.startSmsEnrollment).not.toHaveBeenCalled();
  });

  it("points at the factor that does work today", () => {
    render(<SmsEnrollmentCard status={statusWith()} />);

    expect(screen.getByText(/authenticator app is the second factor/i)).toBeVisible();
  });

  it("acknowledges a phone factor enrolled before the feature was withdrawn", () => {
    // Firebase still asks for this code at sign-in, so hiding it would be a surprise.
    render(
      <SmsEnrollmentCard
        status={statusWith({ enabled: true, phoneNumber: "••• ••• 0123" })}
      />
    );

    expect(screen.getByText(/enrolled for SMS on ••• ••• 0123/i)).toBeVisible();
    expect(screen.getByText(/still applies at sign-in/i)).toBeVisible();
  });
});
