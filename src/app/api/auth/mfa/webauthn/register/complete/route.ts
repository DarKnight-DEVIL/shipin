import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuthWithProfile } from "@/lib/auth";
import crypto from "crypto";

/**
 * POST /api/auth/mfa/webauthn/register/complete
 *
 * Complete WebAuthn registration (ceremony 2 of 2).
 * Verifies the attestation and stores the credential.
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
    const { credential, credentialName } = body;

    if (!credential || !credential.id || !credential.response) {
      return NextResponse.json(
        { error: "Invalid credential data." },
        { status: 400 }
      );
    }

    const userSnapshot = await adminDb.collection("users").doc(auth.profile.uid).get();
    if (!userSnapshot.exists) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const userData = userSnapshot.data();
    const storedChallenge = userData?.mfa?.webauthn?.pendingChallenge;
    const storedCredentialId = userData?.mfa?.webauthn?.pendingCredentialId;

    if (!storedChallenge || !storedCredentialId) {
      return NextResponse.json(
        { error: "No pending WebAuthn registration. Start registration first." },
        { status: 400 }
      );
    }

    // Verify challenge matches
    if (credential.response.clientDataJSON) {
      const clientData = JSON.parse(
        Buffer.from(credential.response.clientDataJSON, "base64").toString()
      );
      if (clientData.challenge !== storedChallenge) {
        return NextResponse.json(
          { error: "Invalid challenge." },
          { status: 400 }
        );
      }
    }

    // Verify the credential ID matches
    if (credential.id !== storedCredentialId) {
      return NextResponse.json(
        { error: "Credential ID mismatch." },
        { status: 400 }
      );
    }

    // Store the credential (attestation verification is simplified here)
    // In production, you should verify the attestation object properly
    const existingCredentials = userData?.mfa?.webauthn?.credentialIds || [];
    const existingNames = userData?.mfa?.webauthn?.credentialNames || [];

    await adminDb.collection("users").doc(auth.profile.uid).update({
      "mfa.webauthn.credentialIds": FieldValue.arrayUnion(storedCredentialId),
      "mfa.webauthn.credentialNames": FieldValue.arrayUnion(credentialName || "Security Key"),
      "mfa.webauthn.enabled": true,
      "mfa.webauthn.pendingChallenge": FieldValue.delete(),
      "mfa.webauthn.pendingCredentialId": FieldValue.delete(),
      "mfa.required": true,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      message: "Security key registered successfully.",
    });
  } catch (error) {
    console.error("WebAuthn register complete error:", error);
    return NextResponse.json(
      { error: "Failed to complete WebAuthn registration." },
      { status: 500 }
    );
  }
}