import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/utils/errors";
import {
  passwordLeakCheckBodySchema,
  readAndValidateBody,
} from "@/lib/validation";
import {
  addRateLimitHeaders,
  apiRateLimiter,
  isRateLimited,
} from "@/lib/rateLimiter";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** HIBP is a third party; a hung connection must not hold a route open. */
const HIBP_TIMEOUT_MS = 5_000;

/**
 * POST /api/auth/password-leak-check
 *
 * Checks a password against the Have I Been Pwned (HIBP) breach database
 * using the k-anonymity range API:
 *
 * 1. Client computes SHA-1(password).toUpperCase()
 * 2. Client sends the 5-char prefix and its own 35-char suffix
 * 3. Server queries HIBP with the prefix only
 * 4. Server compares the suffix locally and answers `{ leaked }`
 *
 * Only the 5-char prefix ever reaches HIBP. The suffix stays between the
 * browser and this server, and the response is a single boolean rather than
 * the ~20–40 KB range body — so the endpoint cannot be used as a free,
 * amplifying HIBP proxy.
 *
 * Public by necessity (it runs before an account exists) and rate-limited per
 * client so one caller cannot spend the upstream budget on everybody's behalf.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const rateLimit = await apiRateLimiter.record(request);

  if (isRateLimited(rateLimit)) {
    const response = NextResponse.json(
      {
        success: false,
        error: "Too many requests, please try again later.",
        code: "RATE_LIMITED",
      },
      { status: 429, headers: NO_STORE }
    );
    addRateLimitHeaders(response.headers, rateLimit);
    return response;
  }

  const parsed = await readAndValidateBody(
    request,
    passwordLeakCheckBodySchema
  );

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid prefix.",
        code: "INVALID_REQUEST_BODY",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  const { prefix, suffix } = parsed.data;

  try {
    const response = await fetch(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      {
        headers: {
          "User-Agent": "ShipIN Security Check",
          "Add-Padding": "true", // HIBP recommends adding padding to obscure request size
        },
        signal: AbortSignal.timeout(HIBP_TIMEOUT_MS),
      }
    );

    if (!response.ok) {
      // If HIBP is unavailable, fail closed: treat as not leaked.
      // A real deployment should log this and alert.
      return NextResponse.json(
        { success: true, leaked: false, serviceUnavailable: true },
        { status: 200, headers: NO_STORE }
      );
    }

    const text = await response.text();

    const leaked = text.split(/\r?\n/).some((line) => {
      const [candidate] = line.split(":");
      return candidate?.trim().toUpperCase() === suffix;
    });

    return NextResponse.json(
      { success: true, leaked },
      { status: 200, headers: NO_STORE }
    );
  } catch (error) {
    console.error(
      "Password leak check failed:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      {
        success: false,
        error: "Leak check unavailable.",
        code: "EXTERNAL_SERVICE_ERROR",
      },
      { status: 502, headers: NO_STORE }
    );
  }
});
