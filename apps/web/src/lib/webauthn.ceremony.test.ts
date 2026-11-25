/**
 * Tests for the WebAuthn ceremony helpers.
 *
 * Kept separate from `webauthn.test.ts` because that suite exercises the pure
 * helpers, while these tests replace @simplewebauthn/server to assert how the
 * options and verification results are shaped.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  state: { production: false, appUrl: "http://localhost:3000" },
  generateRegistrationOptions: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));

vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: mocks.generateRegistrationOptions,
  generateAuthenticationOptions: mocks.generateAuthenticationOptions,
  verifyRegistrationResponse: mocks.verifyRegistrationResponse,
  verifyAuthenticationResponse: mocks.verifyAuthenticationResponse,
}));

vi.mock("@/config/env", () => ({
  get isProduction() {
    return mocks.state.production;
  },
  serverEnv: {
    get APP_URL() {
      return mocks.state.appUrl;
    },
  },
}));

import type { StoredWebAuthnCredential } from "./webauthn";

// Imported per file instead of statically: with a shared module registry the
// first importer fixes which @simplewebauthn/server stub this module binds to,
// so a static import can inherit another file's stub.
let buildAuthenticationOptions: typeof import("./webauthn").buildAuthenticationOptions;
let buildRegistrationOptions: typeof import("./webauthn").buildRegistrationOptions;
let verifyAssertion: typeof import("./webauthn").verifyAssertion;
let verifyRegistration: typeof import("./webauthn").verifyRegistration;
let getWebAuthnConfig: typeof import("./webauthn").getWebAuthnConfig;

const CREDENTIAL: StoredWebAuthnCredential = {
  credentialID: "cred-1",
  publicKey: "pk-1",
  counter: 5,
  transports: ["usb"],
  name: "YubiKey",
  createdAt: 1_700_000_000_000,
};

const response = { id: "cred-1", type: "public-key" } as never;

beforeEach(async () => {
  vi.resetModules();
  ({
    buildAuthenticationOptions,
    buildRegistrationOptions,
    verifyAssertion,
    verifyRegistration,
    getWebAuthnConfig,
  } = await import("./webauthn"));
  mocks.state.production = false;
  mocks.state.appUrl = "http://localhost:3000";
  mocks.generateRegistrationOptions.mockReset();
  mocks.generateAuthenticationOptions.mockReset();
  mocks.verifyRegistrationResponse.mockReset();
  mocks.verifyAuthenticationResponse.mockReset();
});

describe("buildRegistrationOptions", () => {
  it("binds the ceremony to the configured relying party", async () => {
    mocks.generateRegistrationOptions.mockResolvedValue({ challenge: "c" });

    await expect(
      buildRegistrationOptions({
        uid: "uid-1",
        userName: "admin@shipin.app",
        displayName: "Admin",
        excludeCredentials: [CREDENTIAL],
      })
    ).resolves.toEqual({ challenge: "c" });

    const options = mocks.generateRegistrationOptions.mock.calls[0][0];
    expect(options).toMatchObject({
      rpName: "ShipIN",
      rpID: "localhost",
      userName: "admin@shipin.app",
      userDisplayName: "Admin",
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
      excludeCredentials: [{ id: "cred-1", transports: ["usb"] }],
    });
    expect(Buffer.from(options.userID).toString()).toBe("uid-1");
  });
});

describe("verifyRegistration", () => {
  it("maps a verified attestation into a stored credential", async () => {
    const publicKey = new Uint8Array([1, 2, 3]);
    mocks.verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: "new-cred",
          publicKey,
          counter: 0,
          transports: ["hybrid"],
        },
        credentialDeviceType: "multiDevice",
        credentialBackedUp: true,
      },
    });

    const result = await verifyRegistration({
      response,
      expectedChallenge: "challenge-1",
    });

    expect(result).toEqual({
      verified: true,
      credential: {
        credentialID: "new-cred",
        publicKey: Buffer.from(publicKey).toString("base64url"),
        counter: 0,
        transports: ["hybrid"],
        name: "",
        createdAt: expect.any(Number),
        deviceType: "multiDevice",
        backedUp: true,
      },
    });
  });

  it("defaults transports when the authenticator reports none", async () => {
    mocks.verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: { id: "c", publicKey: new Uint8Array(), counter: 0 },
        credentialDeviceType: "singleDevice",
        credentialBackedUp: false,
      },
    });

    const result = await verifyRegistration({
      response,
      expectedChallenge: "c",
    });

    expect(result.verified && result.credential.transports).toEqual([]);
  });

  it("treats a malformed attestation as a failed verification", async () => {
    mocks.verifyRegistrationResponse.mockRejectedValue(
      new Error("bad attestation")
    );

    await expect(
      verifyRegistration({ response, expectedChallenge: "c" })
    ).resolves.toEqual({ verified: false });
  });

  it("treats an unverified result as a failure", async () => {
    mocks.verifyRegistrationResponse.mockResolvedValue({ verified: false });

    await expect(
      verifyRegistration({ response, expectedChallenge: "c" })
    ).resolves.toEqual({ verified: false });
  });

  it("accepts only the served origin in development and only APP_URL in production", async () => {
    mocks.verifyRegistrationResponse.mockResolvedValue({ verified: false });
    await verifyRegistration({ response, expectedChallenge: "c" });
    expect(
      mocks.verifyRegistrationResponse.mock.calls[0][0].expectedOrigin
    ).toEqual(["http://localhost:3000"]);

    mocks.state.production = true;
    mocks.state.appUrl = "https://shipin.app";
    await verifyRegistration({ response, expectedChallenge: "c" });
    expect(mocks.verifyRegistrationResponse.mock.calls[1][0]).toMatchObject({
      expectedOrigin: ["https://shipin.app"],
      expectedRPID: "shipin.app",
    });
  });

  it("accepts this deployment hostname under a shared suffix", async () => {
    // A browser rejects an RP ID that does not extend past the caller's public
    // suffix; it accepts one that does. Refusing every host under vercel.app
    // blocked passkeys on a deployment where the browser would have allowed
    // them, and that is the only reason the admin security screen could not
    // enrol one.
    mocks.state.production = true;
    mocks.state.appUrl = "https://shipin-psi.vercel.app";

    expect(getWebAuthnConfig()).toEqual({
      origin: "https://shipin-psi.vercel.app",
      rpID: "shipin-psi.vercel.app",
      rpName: expect.any(String),
    });
  });

  it("refuses a shared hosting suffix itself as the relying party", async () => {
    mocks.state.production = true;
    mocks.state.appUrl = "https://vercel.app";

    // A passkey scoped to vercel.app belongs to every project on that host.
    expect(() => getWebAuthnConfig()).toThrow(/shared hosting domain/);
    await expect(
      verifyRegistration({ response, expectedChallenge: "c" })
    ).rejects.toThrow(/shared hosting domain/);
  });
});

describe("buildAuthenticationOptions", () => {
  it("maps stored credentials, including the legacy id field", async () => {
    mocks.generateAuthenticationOptions.mockResolvedValue({ challenge: "c" });

    await buildAuthenticationOptions({
      allowCredentials: [
        CREDENTIAL,
        {
          id: "legacy-id",
          transports: [],
        } as unknown as StoredWebAuthnCredential,
        {} as StoredWebAuthnCredential,
      ],
    });

    expect(mocks.generateAuthenticationOptions).toHaveBeenCalledWith({
      rpID: "localhost",
      allowCredentials: [
        { id: "cred-1", transports: ["usb"] },
        { id: "legacy-id", transports: [] },
        { id: "", transports: undefined },
      ],
      userVerification: "preferred",
    });
  });
});

describe("verifyAssertion", () => {
  it("returns the new signature counter", async () => {
    mocks.verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 9 },
    });

    await expect(
      verifyAssertion({
        response,
        expectedChallenge: "c",
        credential: CREDENTIAL,
      })
    ).resolves.toEqual({ verified: true, newCounter: 9 });

    const args = mocks.verifyAuthenticationResponse.mock.calls[0][0];
    expect(args.credential).toMatchObject({ id: "cred-1", counter: 5 });
    expect(Buffer.from(args.credential.publicKey)).toEqual(
      Buffer.from("pk-1", "base64url")
    );
  });

  it("keeps the stored counter when the library omits a new one", async () => {
    mocks.verifyAuthenticationResponse.mockResolvedValue({ verified: true });

    await expect(
      verifyAssertion({
        response,
        expectedChallenge: "c",
        credential: CREDENTIAL,
      })
    ).resolves.toEqual({ verified: true, newCounter: 5 });
  });

  it("treats a thrown verification as failure without bumping the counter", async () => {
    mocks.verifyAuthenticationResponse.mockRejectedValue(
      new Error("cloned authenticator")
    );

    await expect(
      verifyAssertion({
        response,
        expectedChallenge: "c",
        credential: CREDENTIAL,
      })
    ).resolves.toEqual({ verified: false, newCounter: 5 });
  });
});

describe("development on a shared hosting domain", () => {
  it("falls back to a loopback relying party", () => {
    mocks.state.production = false;
    mocks.state.appUrl = "https://shipin-psi.vercel.app";

    // A passkey registered against `vercel.app` would belong to every tenant
    // on the host, so development uses loopback instead of refusing outright.
    expect(getWebAuthnConfig()).toEqual({
      origin: "http://localhost:3000",
      rpID: "localhost",
      rpName: "ShipIN",
    });
  });

  it("binds registration and verification to that loopback party", async () => {
    mocks.state.appUrl = "https://shipin-psi.vercel.app";
    mocks.generateRegistrationOptions.mockResolvedValue({ challenge: "c" });
    mocks.verifyRegistrationResponse.mockResolvedValue({ verified: false });

    await buildRegistrationOptions({
      uid: "uid-1",
      userName: "admin@shipin.app",
      displayName: "Admin",
      excludeCredentials: [],
    });

    expect(mocks.generateRegistrationOptions.mock.calls[0][0]).toMatchObject({
      rpID: "localhost",
    });

    await verifyRegistration({ response, expectedChallenge: "c" });

    expect(mocks.verifyRegistrationResponse.mock.calls[0][0]).toMatchObject({
      expectedOrigin: ["http://localhost:3000"],
      expectedRPID: "localhost",
    });
  });

  it("still refuses a bare shared hosting relying party in production", () => {
    mocks.state.production = true;
    mocks.state.appUrl = "https://netlify.app";

    expect(() => getWebAuthnConfig()).toThrow(/shared hosting domain/);
  });

  it("follows the port the dev server is actually on", () => {
    mocks.state.appUrl = "https://shipin-psi.vercel.app";

    // `next dev -p 4321`, or Next falling back off a busy 3000: the passkey is
    // bound to the origin that served the page, not the URL in `.env`.
    expect(getWebAuthnConfig("http://localhost:4321")).toEqual({
      origin: "http://localhost:4321",
      rpID: "localhost",
      rpName: "ShipIN",
    });
  });

  it("ignores a request origin that is not loopback", () => {
    mocks.state.appUrl = "https://shipin-psi.vercel.app";

    // The value comes from the request, so a forged Host must not be able to
    // move the relying party to a domain an attacker controls.
    expect(getWebAuthnConfig("https://evil.example").origin).toBe(
      "http://localhost:3000"
    );
  });

  it("keeps a domain the deployment owns even in development", () => {
    mocks.state.appUrl = "https://shipin.example.com";

    expect(getWebAuthnConfig("http://localhost:4321").origin).toBe(
      "https://shipin.example.com"
    );
  });
});

describe("verification on a non-default dev port", () => {
  it("accepts the origin the ceremony was served from", async () => {
    mocks.state.appUrl = "https://shipin-psi.vercel.app";
    mocks.verifyRegistrationResponse.mockResolvedValue({ verified: false });

    await verifyRegistration({
      response,
      expectedChallenge: "c",
      requestOrigin: "http://localhost:4321",
    });

    expect(mocks.verifyRegistrationResponse.mock.calls[0][0]).toMatchObject({
      expectedOrigin: ["http://localhost:4321"],
      expectedRPID: "localhost",
    });
  });
});
