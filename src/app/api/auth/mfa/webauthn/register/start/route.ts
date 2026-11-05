import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuthWithProfile } from "@/lib/auth";
import { generateWebAuthnChallenge, generateCredentialId } from "@/lib/mfa";

/**
 * POST /api/auth/mfa/webauthn/register/start
 *
 * Start WebAuthn registration (ceremony 1 of 2).
 * Returns a PublicKeyCredentialCreationOptions object for navigator.credentials.create().
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
    // Fetch full user profile for email/displayName
    const userSnapshot = await adminDb.collection("users").doc(auth.profile.uid).get();
    const userData = userSnapshot.data() || {};
    const email = userData.email || auth.token.email;
    const displayName = userData.displayName || auth.token.name || email;

    const challenge = generateWebAuthnChallenge();
    const credentialId = generateCredentialId();

    // Store challenge in user profile temporarily
    await adminDb.collection("users").doc(auth.profile.uid).update({
      "mfa.webauthn.pendingChallenge": challenge,
      "mfa.webauthn.pendingCredentialId": credentialId,
      updatedAt: new Date().toISOString(),
    });

    // Return PublicKeyCredentialCreationOptions
    const options = {
      publicKey: {
        rp: {
          name: "ShipIN",
          id: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://shipin.com").hostname,
        },
        user: {
          id: credentialId,
          name: email,
          displayName,
        },
        challenge: Uint8Array.from(atob(challenge), c => c.charCodeAt(0)).buffer,
        pubKeyCredParams: [
          { type: "public-key", alg: -7 }, // ES256
          { type: "public-key", alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "preferred",
          requireResidentKey: false,
        },
        timeout: 60000,
        attestation: "direct",
        excludeCredentials: [], // Could exclude existing credential IDs
      },
    };

    return NextResponse.json(options);
  } catch (error) {
    console.error("WebAuthn register start error:", error);
    return NextResponse.json(
      { error: "Failed to start WebAuthn registration." },
      { status: 500 }
    );
  }
}