/**
 * What production accepts, and what a forged `Host` cannot change.
 *
 * The routes pass `request.nextUrl.origin` as `requestOrigin`. That is safe only
 * because production ignores it: `getWebAuthnConfig` derives the origin from APP_URL
 * and consults the request solely in development, and then only when it is a loopback
 * origin. A passkey is bound to one origin for its whole life, so an accepted origin
 * that follows the request would let a proxy or a preview hostname mint credentials
 * that can never be used again - or verify against an origin an attacker chose.
 *
 * These assertions are on the value handed to @simplewebauthn, not on the config
 * object: the config is only interesting where it reaches the ceremony.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  verifyAuthenticationResponse: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
}));

async function loadWebAuthn(options: {
  production: boolean;
  appUrl?: string;
}) {
  vi.resetModules();

  vi.doMock("@/config/env", () => ({
    isProduction: options.production,
    serverEnv: { APP_URL: options.appUrl },
  }));

  vi.doMock("@simplewebauthn/server", () => ({
    generateAuthenticationOptions: vi.fn(),
    generateRegistrationOptions: vi.fn(),
    verifyAuthenticationResponse: calls.verifyAuthenticationResponse,
    verifyRegistrationResponse: calls.verifyRegistrationResponse,
  }));

  return import("./webauthn");
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/config/env");
  vi.doUnmock("@simplewebauthn/server");
  calls.verifyAuthenticationResponse.mockReset();
  calls.verifyRegistrationResponse.mockReset();
});

describe("production WebAuthn origin", () => {
  it("ignores the request origin, whatever a forged Host says", async () => {
    const { getWebAuthnConfig } = await loadWebAuthn({
      production: true,
      appUrl: "https://shipin.app",
    });

    for (const forged of [
      "https://evil.example",
      "https://shipin.app.evil.example",
      "http://localhost:3000",
      "not a url",
    ]) {
      const config = getWebAuthnConfig(forged);

      expect(config.origin, forged).toBe("https://shipin.app");
      expect(config.rpID, forged).toBe("shipin.app");
    }
  });

  it("verifies an assertion against APP_URL's origin only", async () => {
    calls.verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 5 },
    });

    const { verifyAssertion } = await loadWebAuthn({
      production: true,
      appUrl: "https://shipin.app",
    });

    await verifyAssertion({
      response: { id: "cred-1" } as never,
      expectedChallenge: "challenge-1",
      credential: {
        credentialID: "cred-1",
        publicKey: "pk-1",
        counter: 4,
        transports: ["usb"],
        name: "YubiKey",
        createdAt: 1_700_000_000_000,
      },
      requestOrigin: "https://evil.example",
    });

    expect(calls.verifyAuthenticationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedOrigin: ["https://shipin.app"],
        expectedRPID: "shipin.app",
      })
    );
  });

  it("verifies a registration against APP_URL's origin only", async () => {
    calls.verifyRegistrationResponse.mockResolvedValue({ verified: false });

    const { verifyRegistration } = await loadWebAuthn({
      production: true,
      appUrl: "https://shipin.app",
    });

    await verifyRegistration({
      response: { id: "cred-1" } as never,
      expectedChallenge: "challenge-1",
      requestOrigin: "https://evil.example",
    });

    expect(calls.verifyRegistrationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedOrigin: ["https://shipin.app"],
        expectedRPID: "shipin.app",
      })
    );
  });

  it("refuses to guess an origin when APP_URL is missing", async () => {
    const { getWebAuthnConfig } = await loadWebAuthn({ production: true });

    expect(() => getWebAuthnConfig("https://shipin.app")).toThrow(
      /APP_URL must be an absolute URL in production/
    );
  });
});

describe("development WebAuthn origin", () => {
  it("follows a loopback request origin when APP_URL is a shared host", async () => {
    /*
     * The usual dev setup: APP_URL is the Vercel deployment, and `next dev` runs on
     * whatever port was free. A ceremony on localhost:4100 has to be verified against
     * localhost:4100 or no passkey can be enrolled locally at all.
     */
    const { getWebAuthnConfig } = await loadWebAuthn({
      production: false,
      appUrl: "https://shipin-psi.vercel.app",
    });

    const config = getWebAuthnConfig("http://localhost:4100");

    expect(config.origin).toBe("http://localhost:4100");
    expect(config.rpID).toBe("localhost");
  });

  it("still refuses a non-loopback request origin", async () => {
    // The reason dev may follow the request at all: a forged Host can name another
    // loopback port, never a domain someone else controls.
    const { getWebAuthnConfig } = await loadWebAuthn({
      production: false,
      appUrl: "https://shipin-psi.vercel.app",
    });

    const config = getWebAuthnConfig("https://evil.example");

    expect(config.origin).toBe("http://localhost:3000");
    expect(config.rpID).toBe("localhost");
  });

  it("keeps a real domain's origin, because dev may serve it too", async () => {
    // With APP_URL on a domain ShipIN owns, a loopback request must not move the
    // relying party: credentials enrolled against that domain would stop working.
    const { getWebAuthnConfig } = await loadWebAuthn({
      production: false,
      appUrl: "https://shipin.app",
    });

    const config = getWebAuthnConfig("http://localhost:4100");

    expect(config.origin).toBe("https://shipin.app");
    expect(config.rpID).toBe("shipin.app");
  });
});
