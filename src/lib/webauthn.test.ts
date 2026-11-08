import { describe, expect, it } from "vitest";

import {
  WEBAUTHN_CHALLENGE_TTL_MS,
  challengeFields,
  clearedChallengeFields,
  getWebAuthnConfig,
  isChallengeExpired,
  readStoredCredentials,
  verifyAssertion,
  verifyRegistration,
  type StoredWebAuthnCredential,
} from "./webauthn";

const CREDENTIAL: StoredWebAuthnCredential = {
  credentialID: "cred-1",
  publicKey: "pk-1",
  counter: 3,
  transports: ["usb"],
  name: "YubiKey",
  createdAt: 1_700_000_000_000,
  deviceType: "singleDevice",
  backedUp: false,
};

describe("getWebAuthnConfig", () => {
  it("derives the relying party from APP_URL, not the request", () => {
    const config = getWebAuthnConfig();

    expect(config.origin).toBe("http://localhost:3000");
    expect(config.rpID).toBe("localhost");
    expect(config.rpName).toBe("ShipIN");
  });
});

describe("readStoredCredentials", () => {
  it("returns nothing when there is no record", () => {
    expect(readStoredCredentials(undefined)).toEqual([]);
    expect(readStoredCredentials(null)).toEqual([]);
    expect(readStoredCredentials({})).toEqual([]);
  });

  it("returns stored credentials", () => {
    expect(readStoredCredentials({ credentials: [CREDENTIAL] })).toEqual([
      CREDENTIAL,
    ]);
  });

  it("drops entries without a public key (unverifiable)", () => {
    const record = {
      credentials: [
        CREDENTIAL,
        { credentialID: "cred-2" },
        { publicKey: "pk-3" },
        null,
      ],
    } as never;

    expect(readStoredCredentials(record)).toEqual([CREDENTIAL]);
  });

  it("ignores the legacy credentialIds shape", () => {
    expect(readStoredCredentials({ credentialIds: ["cred-1"] })).toEqual([]);
  });
});

describe("challenge handling", () => {
  it("stamps an expiry one TTL ahead", () => {
    const fields = challengeFields("challenge-1", 1_000);

    expect(fields["mfa.webauthn.pendingChallenge"]).toBe("challenge-1");
    expect(fields["mfa.webauthn.pendingExpires"]).toBe(
      1_000 + WEBAUTHN_CHALLENGE_TTL_MS
    );
  });

  it("treats missing, non-numeric and past expiries as expired", () => {
    const now = 10_000;

    expect(isChallengeExpired(undefined, now)).toBe(true);
    expect(isChallengeExpired("10000", now)).toBe(true);
    expect(isChallengeExpired(now - 1, now)).toBe(true);
    expect(isChallengeExpired(now + 1, now)).toBe(false);
  });

  it("clears both challenge fields", () => {
    expect(clearedChallengeFields()).toEqual({
      "mfa.webauthn.pendingChallenge": null,
      "mfa.webauthn.pendingExpires": null,
    });
  });
});

describe("ceremony verification never accepts junk", () => {
  const junkRegistration = {
    credentialID: "cred-1",
    rawId: "cred-1",
    type: "public-key",
    clientExtensionResults: {},
    response: {
      clientDataJSON: "e30",
      attestationObject: "AAAA",
      transports: [],
    },
  } as never;

  const junkAssertion = {
    credentialID: "cred-1",
    rawId: "cred-1",
    type: "public-key",
    clientExtensionResults: {},
    response: {
      clientDataJSON: "e30",
      authenticatorData: "AAAA",
      signature: "AAAA",
      userHandle: null,
    },
  } as never;

  it("rejects a malformed attestation instead of throwing", async () => {
    await expect(
      verifyRegistration({
        response: junkRegistration,
        expectedChallenge: "challenge-1",
      })
    ).resolves.toEqual({ verified: false });
  });

  it("rejects a malformed assertion and keeps the stored counter", async () => {
    await expect(
      verifyAssertion({
        response: junkAssertion,
        expectedChallenge: "challenge-1",
        credential: CREDENTIAL,
      })
    ).resolves.toEqual({ verified: false, newCounter: CREDENTIAL.counter });
  });
});
