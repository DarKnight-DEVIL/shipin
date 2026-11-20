/**
 * `utils/errors` — the envelope every failed API response is built from.
 *
 * `success: false` is the discriminator: `response-convention.md` requires it
 * and `apiClient` branches on it (`!response.ok || payload.success === false`).
 * It went missing once and no test noticed — the refund smoke test did, by
 * reading a body that said `undefined` where it expected a rejection.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createShipINError, serializeError, withErrorHandler } from "./index";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("serializeError", () => {
  it("marks an application error as a failure, keeping its message and code", () => {
    expect(
      serializeError(createShipINError("Nope.", "BAD_REQUEST", 400))
    ).toEqual({
      success: false,
      error: "Nope.",
      code: "BAD_REQUEST",
    });
  });

  it("marks an unexpected thrown value as a failure too", () => {
    // A non-Error cannot be attributed to a known code, so it is reported as an
    // internal failure — but still as a failure.
    expect(serializeError("not an error")).toMatchObject({
      success: false,
      code: "INTERNAL_ERROR",
      error: "An unexpected error occurred.",
    });
  });

  it("includes details outside production and withholds them in production", () => {
    const error = createShipINError("Bad input.", "VALIDATION_ERROR", 400, {
      field: "email",
    });

    expect(serializeError(error)).toMatchObject({
      details: { field: "email" },
    });

    vi.stubEnv("NODE_ENV", "production");

    expect(serializeError(error)).not.toHaveProperty("details");
  });
});

describe("withErrorHandler", () => {
  it("answers with the error's status and the same envelope", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const handler = withErrorHandler(async () => {
      throw createShipINError("Nope.", "BAD_REQUEST", 400);
    });

    const response = await handler();

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Nope.",
      code: "BAD_REQUEST",
    });
  });
});
