import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyPhoneNumber: vi.fn(),
  credential: vi.fn(),
  assertion: vi.fn(),
  getSession: vi.fn(),
  enroll: vi.fn(),
  resolveSignIn: vi.fn(),
  getResolver: vi.fn(),
  multiFactor: vi.fn(),
  clear: vi.fn(),
}));

vi.mock("firebase/auth", () => {
  class RecaptchaVerifier {
    clear = mocks.clear;
  }

  class PhoneAuthProvider {
    verifyPhoneNumber = mocks.verifyPhoneNumber;
    static credential = mocks.credential;
  }

  return {
    RecaptchaVerifier,
    PhoneAuthProvider,
    PhoneMultiFactorGenerator: {
      FACTOR_ID: "phone",
      assertion: mocks.assertion,
    },
    multiFactor: mocks.multiFactor,
    getMultiFactorResolver: mocks.getResolver,
  };
});

import {
  FirebaseMfaError,
  confirmSmsEnrollment,
  confirmSecondFactorChallenge,
  enrolledPhoneFactor,
  isMultiFactorRequired,
  startSecondFactorChallenge,
  startSmsEnrollment,
} from "./firebaseMfa";

const auth = {} as never;
const user = { uid: "admin-1" } as never;

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.getSession.mockResolvedValue({ session: "session-1" });
  mocks.verifyPhoneNumber.mockResolvedValue("verification-id");
  mocks.credential.mockReturnValue("phone-credential");
  mocks.assertion.mockReturnValue("assertion");
  mocks.enroll.mockResolvedValue(undefined);
  mocks.multiFactor.mockReturnValue({
    getSession: mocks.getSession,
    enroll: mocks.enroll,
    enrolledFactors: [],
  });
});

describe("isMultiFactorRequired", () => {
  it("only matches the second-factor code", () => {
    expect(isMultiFactorRequired({ code: "auth/multi-factor-auth-required" })).toBe(true);
    expect(isMultiFactorRequired({ code: "auth/wrong-password" })).toBe(false);
    expect(isMultiFactorRequired(null)).toBe(false);
  });
});

describe("startSmsEnrollment", () => {
  it("verifies the number with the enrollment session and clears the verifier", async () => {
    await expect(startSmsEnrollment(auth, user, "+15551234567")).resolves.toBe(
      "verification-id"
    );

    expect(mocks.getSession).toHaveBeenCalled();
    expect(mocks.verifyPhoneNumber).toHaveBeenCalledWith(
      { phoneNumber: "+15551234567", session: { session: "session-1" } },
      expect.anything()
    );
    expect(mocks.clear).toHaveBeenCalled();
  });

  it("turns a Firebase failure into a displayable error", async () => {
    mocks.verifyPhoneNumber.mockRejectedValue({ code: "auth/invalid-phone-number" });

    await expect(startSmsEnrollment(auth, user, "+1555")).rejects.toBeInstanceOf(
      FirebaseMfaError
    );
  });
});

describe("confirmSmsEnrollment", () => {
  it("enrolls the phone factor from the code", async () => {
    await confirmSmsEnrollment(user, "verification-id", "123456");

    expect(mocks.credential).toHaveBeenCalledWith("verification-id", "123456");
    expect(mocks.assertion).toHaveBeenCalledWith("phone-credential");
    expect(mocks.enroll).toHaveBeenCalledWith("assertion", "ShipIN SMS");
  });
});

describe("enrolledPhoneFactor", () => {
  it("returns the phone factor and ignores others", () => {
    expect(enrolledPhoneFactor(user)).toBeNull();

    mocks.multiFactor.mockReturnValue({
      enrolledFactors: [
        { factorId: "totp" },
        { factorId: "phone", phoneNumber: "+1******4567" },
      ],
    });

    expect(enrolledPhoneFactor(user)).toMatchObject({ factorId: "phone" });
  });
});

describe("startSecondFactorChallenge", () => {
  it("refuses an account without a phone factor", async () => {
    mocks.getResolver.mockReturnValue({ hints: [{ factorId: "totp" }], session: "s" });

    await expect(
      startSecondFactorChallenge(auth, { code: "auth/multi-factor-auth-required" } as never)
    ).rejects.toMatchObject({ code: "MFA_UNSUPPORTED_FACTOR" });
  });

  it("sends a code for the enrolled phone and keeps the resolver", async () => {
    const hint = { factorId: "phone", phoneNumber: "+1******4567" };
    const resolver = { hints: [hint], session: "session-1" };

    mocks.getResolver.mockReturnValue(resolver);

    await expect(
      startSecondFactorChallenge(auth, { code: "auth/multi-factor-auth-required" } as never)
    ).resolves.toEqual({
      resolver,
      verificationId: "verification-id",
      phoneNumber: "+1******4567",
    });
    expect(mocks.verifyPhoneNumber).toHaveBeenCalledWith(
      { multiFactorHint: hint, session: "session-1" },
      expect.anything()
    );
    expect(mocks.clear).toHaveBeenCalled();
  });
});

describe("confirmSecondFactorChallenge", () => {
  it("resolves the sign-in and returns the authenticated user", async () => {
    const signedIn = { uid: "admin-1" };
    const resolver = { resolveSignIn: mocks.resolveSignIn, hints: [], session: "s" };

    mocks.resolveSignIn.mockResolvedValue({ user: signedIn });

    await expect(
      confirmSecondFactorChallenge(
        { resolver, verificationId: "verification-id", phoneNumber: null } as never,
        "123456"
      )
    ).resolves.toBe(signedIn);
    expect(mocks.resolveSignIn).toHaveBeenCalledWith("assertion");
  });
});
