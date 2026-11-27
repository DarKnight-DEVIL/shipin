// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import {
  CRON_CLOCK_SKEW_MS,
  CRON_REPLAY_WINDOW_MS,
  verifyCronRequest,
} from "./cronAuth";

const SECRET = "cron-secret-for-tests";

function sign(timestamp: string, body: string, secret = SECRET) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}|${body}`)
    .digest("hex");
}

function request(
  timestamp: string | null,
  signature: string | null,
  body = ""
): Request {
  const headers = new Headers();
  if (timestamp !== null) headers.set("x-cron-timestamp", timestamp);
  if (signature !== null) headers.set("x-cron-signature", signature);

  return new Request("https://shipin.test/api/admin/cron", {
    method: "POST",
    headers,
    body,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("verifyCronRequest", () => {
  it("accepts a fresh request signed with the shared secret", async () => {
    const timestamp = String(Date.now());

    await expect(
      verifyCronRequest(request(timestamp, sign(timestamp, "")), SECRET)
    ).resolves.toBe(true);
  });

  it("binds the signature to the body", async () => {
    const timestamp = String(Date.now());
    const signature = sign(timestamp, "");

    // A signature for an empty body must not authorise a body that changes work.
    await expect(
      verifyCronRequest(request(timestamp, signature, '{"batch":999}'), SECRET)
    ).resolves.toBe(false);
  });

  it("leaves the request body readable for the handler", async () => {
    // verifyCronRequest reads the body to check the signature. Reading the
    // original stream left every later `request.json()` in a cron route with
    // an empty string and no error — a trap that only fires when the second
    // reader is added. The verification reads a clone instead.
    const timestamp = String(Date.now());
    const body = '{"batch":3}';
    const cronRequest = request(timestamp, sign(timestamp, body), body);

    await expect(verifyCronRequest(cronRequest, SECRET)).resolves.toBe(true);

    await expect(cronRequest.text()).resolves.toBe(body);
  });

  it("rejects a signature made with a different secret", async () => {
    const timestamp = String(Date.now());

    await expect(
      verifyCronRequest(
        request(timestamp, sign(timestamp, "", "some-other-secret")),
        SECRET
      )
    ).resolves.toBe(false);
  });

  it("rejects a replayed request once the window has passed", async () => {
    const old = Date.now() - CRON_REPLAY_WINDOW_MS - 1000;
    const timestamp = String(old);

    await expect(
      verifyCronRequest(request(timestamp, sign(timestamp, "")), SECRET)
    ).resolves.toBe(false);
  });

  it("tolerates small clock skew but not a far-future timestamp", async () => {
    const withinSkew = String(Date.now() + CRON_CLOCK_SKEW_MS - 500);
    const beyondSkew = String(Date.now() + CRON_CLOCK_SKEW_MS + 5000);

    await expect(
      verifyCronRequest(request(withinSkew, sign(withinSkew, "")), SECRET)
    ).resolves.toBe(true);
    await expect(
      verifyCronRequest(request(beyondSkew, sign(beyondSkew, "")), SECRET)
    ).resolves.toBe(false);
  });

  it("refuses when the secret, a header or the timestamp is missing", async () => {
    const timestamp = String(Date.now());

    await expect(
      verifyCronRequest(request(timestamp, sign(timestamp, "")), undefined)
    ).resolves.toBe(false);
    await expect(
      verifyCronRequest(request(null, sign(timestamp, "")), SECRET)
    ).resolves.toBe(false);
    await expect(
      verifyCronRequest(request(timestamp, null), SECRET)
    ).resolves.toBe(false);
    await expect(
      verifyCronRequest(request("not-a-number", sign(timestamp, "")), SECRET)
    ).resolves.toBe(false);
  });
});
