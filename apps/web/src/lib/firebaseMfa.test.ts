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

  confirmSecondFactorChallenge,
  enrolledPhoneFactor,
  isMultiFactorRequired,
  startSecondFactorChallenge,

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
    expect(
      isMultiFactorRequired({ code: "auth/multi-factor-auth-required" })
    ).toBe(true);
    expect(isMultiFactorRequired({ code: "auth/wrong-password" })).toBe(false);
    expect(isMultiFactorRequired(null)).toBe(false);
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
    mocks.getResolver.mockReturnValue({
      hints: [{ factorId: "totp" }],
      session: "s",
    });

    await expect(
      startSecondFactorChallenge(auth, {
        code: "auth/multi-factor-auth-required",
      } as never)
    ).rejects.toMatchObject({ code: "MFA_UNSUPPORTED_FACTOR" });
  });

  it("surfaces a failed send as a displayable error", async () => {
    mocks.getResolver.mockReturnValue({
      hints: [{ factorId: "phone", phoneNumber: "+1******4567" }],
      session: "session-1",
    });
    mocks.verifyPhoneNumber.mockRejectedValue({ code: "auth/too-many-requests" });

    await expect(
      startSecondFactorChallenge(auth, {
        code: "auth/multi-factor-auth-required",
      } as never)
    ).rejects.toMatchObject({ code: "auth/too-many-requests" });
    expect(mocks.clear).toHaveBeenCalled();
  });

  it("sends a code for the enrolled phone and keeps the resolver", async () => {
    const hint = { factorId: "phone", phoneNumber: "+1******4567" };
    const resolver = { hints: [hint], session: "session-1" };

    mocks.getResolver.mockReturnValue(resolver);

    await expect(
      startSecondFactorChallenge(auth, {
        code: "auth/multi-factor-auth-required",
      } as never)
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
  it("turns a known Firebase code into its own sentence", async () => {
    // The mapping is what a person reads; an unmapped failure here used to surface as
    // a bare "FirebaseError: auth/..." page.
    const resolver = { resolveSignIn: mocks.resolveSignIn, hints: [], session: "s" };
    mocks.resolveSignIn.mockRejectedValue({ code: "auth/invalid-verification-code" });

    await expect(
      confirmSecondFactorChallenge(
        { resolver, verificationId: "v", phoneNumber: null } as never,
        "000000"
      )
    ).rejects.toMatchObject({
      code: "auth/invalid-verification-code",
      message: "That code is not correct. Try again.",
    });
  });

  it("falls back to a generic message for an unknown or missing code", async () => {
    const resolver = { resolveSignIn: mocks.resolveSignIn, hints: [], session: "s" };

    mocks.resolveSignIn.mockRejectedValueOnce(new Error("network down"));
    await expect(
      confirmSecondFactorChallenge(
        { resolver, verificationId: "v", phoneNumber: null } as never,
        "000000"
      )
    ).rejects.toMatchObject({
      code: "MFA_FAILED",
      message: expect.stringContaining("could not be completed"),
    });

    mocks.resolveSignIn.mockRejectedValueOnce({ code: "auth/something-new" });
    await expect(
      confirmSecondFactorChallenge(
        { resolver, verificationId: "v", phoneNumber: null } as never,
        "000000"
      )
    ).rejects.toMatchObject({ code: "auth/something-new" });
  });

  it("resolves the sign-in and returns the authenticated user", async () => {
    const signedIn = { uid: "admin-1" };
    const resolver = {
      resolveSignIn: mocks.resolveSignIn,
      hints: [],
      session: "s",
    };

    mocks.resolveSignIn.mockResolvedValue({ user: signedIn });

    await expect(
      confirmSecondFactorChallenge(
        {
          resolver,
          verificationId: "verification-id",
          phoneNumber: null,
        } as never,
        "123456"
      )
    ).resolves.toBe(signedIn);
    expect(mocks.resolveSignIn).toHaveBeenCalledWith("assertion");
  });
});
