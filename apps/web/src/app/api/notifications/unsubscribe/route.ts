import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyUnsubscribeToken } from "@/lib/privacy/unsubscribeToken";

/**
 * One-click email unsubscribe.
 *
 * Public by design: the signed token in the URL is the authorisation, because a
 * person clicking a link in their inbox is not signed in. It can only turn the
 * email channel off for the account whose id was signed, so the blast radius of
 * a leaked link is one inbox.
 *
 * GET renders a small confirmation page (what a link click hits); POST is the
 * RFC 8058 one-click action a mail client sends, which must not require a page.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function confirmationPage(status: number, heading: string, body: string) {
  return new NextResponse(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${heading} | ShipIN</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; background: #f9fafb; color: #111827; margin: 0; }
  main { max-width: 34rem; margin: 12vh auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 2rem; }
  h1 { font-size: 1.375rem; margin: 0 0 .75rem; }
  p { line-height: 1.6; color: #374151; margin: 0 0 1rem; }
  a { color: #c2410c; }
</style>
</head>
<body>
<main>
<h1>${heading}</h1>
<p>${body}</p>
<p>You can still reach us at <a href="mailto:support@shipin.co">support@shipin.co</a>.</p>
</main>
</body>
</html>`,
    { status, headers: { ...NO_STORE, "Content-Type": "text/html; charset=utf-8" } }
  );
}

async function applyUnsubscribe(uid: string, token: string): Promise<boolean> {
  if (!uid || !token || !verifyUnsubscribeToken(uid, token)) return false;

  // Dot paths so the rest of the notification preferences survive untouched.
  await adminDb.collection("users").doc(uid).update({
    "preferences.notifications.channels.email": false,
    "preferences.notifications.emailOptOutAt": new Date().toISOString(),
  });

  return true;
}

export async function GET(request: NextRequest) {
  const uid = request.nextUrl.searchParams.get("uid") ?? "";
  const token = request.nextUrl.searchParams.get("token") ?? "";

  const ok = await applyUnsubscribe(uid, token);
  if (!ok) {
    return confirmationPage(
      400,
      "This unsubscribe link is not valid",
      "The link is incomplete or was altered. Sign in and turn off email notifications under Settings → Notifications, or reply to any ShipIN email and we will do it for you."
    );
  }

  return confirmationPage(
    200,
    "You are unsubscribed from ShipIN emails",
    "We have turned off email notifications for your account. Order and payment confirmations stay available in your dashboard, and turning email back on takes one switch under Settings → Notifications."
  );
}

export async function POST(request: NextRequest) {
  const uid = request.nextUrl.searchParams.get("uid") ?? "";
  const token = request.nextUrl.searchParams.get("token") ?? "";

  const ok = await applyUnsubscribe(uid, token);
  if (!ok) {
    return NextResponse.json(
      { success: false, error: "Invalid unsubscribe link.", code: "INVALID_TOKEN" },
      { status: 400, headers: NO_STORE }
    );
  }

  return NextResponse.json({ success: true }, { headers: NO_STORE });
}
