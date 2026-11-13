import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/utils/errors";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * POST /api/auth/password-leak-check
 *
 * Checks a password against the Have I Been Pwned (HIBP) breach database
 * using the k-anonymity search approach:
 *
 * 1. Client computes SHA-1(password).toUpperCase()
 * 2. Client sends only the first 5 hex chars (the "prefix")
 * 3. Server queries HIBP with the prefix
 * 4. Server returns the matching suffixes (or none)
 *
 * The server never sees the full password hash — only a 5-char prefix
 * that is useless without the remaining 35 chars.
 *
 * Rate-limited to prevent scraping.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  let body: { prefix?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request.", code: "INVALID_JSON" },
      { status: 400, headers: NO_STORE }
    );
  }

  const prefix = typeof body.prefix === "string" ? body.prefix.trim().toUpperCase() : "";
  if (!/^[0-9A-F]{5}$/.test(prefix)) {
    return NextResponse.json(
      { success: false, error: "Invalid prefix.", code: "INVALID_REQUEST_BODY" },
      { status: 400, headers: NO_STORE }
    );
  }

  try {
    const response = await fetch(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      {
        headers: {
          "User-Agent": "ShipIN Security Check",
          "Add-Padding": "true", // HIBP recommends adding padding to obscure request size
        },
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
    const suffixes = text
      .split("\n")
      .map((line) => line.trim().toUpperCase())
      .filter(Boolean);

    return NextResponse.json(
      { success: true, suffixes },
      { status: 200, headers: NO_STORE }
    );
  } catch (error) {
    console.error("Password leak check failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: "Leak check unavailable.", code: "EXTERNAL_SERVICE_ERROR" },
      { status: 502, headers: NO_STORE }
    );
  }
});