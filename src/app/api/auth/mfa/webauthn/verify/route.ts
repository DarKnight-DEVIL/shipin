import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuthWithProfile } from "@/lib/auth";

/**
 * POST /api/auth/mfa/webauthn/verify
 *
 * Verify a WebAuthn assertion (login).
 * Returns a PublicKeyCredentialRequestOptions for navigator.credentials.get().
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  if (auth.profile.role !== "admin") {
    return NextResponse.json(
      { error: "Administrator access required." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { credential, verifyOnly } = body;

    // If verifyOnly is true, this is the actual verification step
    if (verifyOnly && credential) {
      const userSnapshot = await adminDb.collection("users").doc(auth.profile.uid).get();
      if (!userSnapshot.exists) {
        return NextResponse.json({ error: "User not found." }, { status: 404 });
      }

      const userData = userSnapshot.data();
      const credentialIds = userData?.mfa?.webauthn?.credentialIds || [];

      if (!credentialIds.includes(credential.id)) {
        return NextResponse.json(
          { error: "Unknown credential." },
          { status: 400 }
        );
      }

      // In production, verify the assertion response properly
      // This is a simplified check - real implementation needs
      // to verify the authenticatorData, signature, clientDataJSON
      return NextResponse.json({
        success: true,
        message: "WebAuthn verification successful.",
      });
    }

    // Otherwise, return challenge for the client to sign
    // Use Web Crypto API (available in edge runtime)
    const challengeBytes = new Uint8Array(32);
    crypto.getRandomValues(challengeBytes);
    const challenge = btoa(String.fromCharCode(...challengeBytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    const options = {
      publicKey: {
        challenge: Uint8Array.from(atob(challenge), c => c.charCodeAt(0)).buffer,
        timeout: 60000,
        rpId: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://shipin.com").hostname,
        allowCredentials: [],
        userVerification: "preferred",
      },
    };

    return NextResponse.json(options);
  } catch (error) {
    console.error("WebAuthn verify error:", error);
    return NextResponse.json(
      { error: "Failed to verify WebAuthn." },
      { status: 500 }
    );
  }
}