"use client";

import { useEffect, useState } from "react";
import { getRedirectResult } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import SigningInOverlay from "@/components/SigningInOverlay";
import {
  clearAuthRedirectPending,
  isAuthRedirectPending,
} from "@/lib/authRedirectPending";

const SAFE_NEXT_ORIGIN = "https://shipin.invalid";

/**
 * Resolve the `next` parameter to a same-origin path, or null.
 *
 * The shape checks alone are not enough: browsers normalise a backslash to a
 * slash, so `/\evil.com` passes both `startsWith("/")` and the
 * `startsWith("//")` guard and then navigates to the protocol-relative
 * `//evil.com`. Parsing against a fixed origin and comparing it rejects that
 * — along with control characters and anything else a URL parser rewrites —
 * in one place, instead of growing one `startsWith` special case per bypass.
 */
function sameOriginPath(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;

  try {
    const url = new URL(raw, SAFE_NEXT_ORIGIN);
    if (url.origin !== SAFE_NEXT_ORIGIN) return null;

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export default function AuthRedirectHandler() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const safeRequestedNext = sameOriginPath(searchParams.get("next"));

  // Returning from the redirect fallback: cover the login form with the
  // signing-in interstitial until the result is resolved (or the navigation
  // to the destination page has completed), so the user never sees the form
  // flash back mid-sign-in.
  const [returningFromRedirect, setReturningFromRedirect] = useState(false);

  useEffect(() => {
    // One-time mount sync from sessionStorage: the flag was written by the
    // previous page before the browser left for Google, so it can only be
    // read after hydration. This is an external-system read, not derived
    // state, and it happens exactly once per mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isAuthRedirectPending()) setReturningFromRedirect(true);
  }, []);

  // The root layout keeps this component mounted across client navigations,
  // so the interstitial must unmount when the destination page is actually
  // showing — not when routing merely starts.
  const showSignInInterstitial =
    returningFromRedirect && pathname === "/login";

  useEffect(() => {
    let mounted = true;

    /** Shared post-sign-in routing for both the result and the fallback. */
    async function routeSignedInUser(user: {
      uid: string;
      displayName: string | null;
      email: string | null;
      photoURL: string | null;
    }) {
      toast.success(
        `Welcome${user.displayName ? `, ${user.displayName}` : ""}!`
      );

      let destination = "/dashboard";

      try {
        // Imported here, not at module scope: this handler lives in the root
        // layout, and the profile service pulls in the Firestore SDK. A static
        // import would ship ~160 KB (gzip) of Firestore to every public page
        // for a lookup that only matters when returning from a redirect sign-in.
        const { ensureUserProfile } =
          await import("@/features/users/services/userProfile");
        // Redirect sign-in bypasses registration just like the popup flow,
        // so repair a missing profile before navigating.
        const profile = await ensureUserProfile({
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          photoURL: user.photoURL,
        });
        if (profile?.role === "admin") {
          destination = safeRequestedNext || "/admin/dashboard";
        } else {
          destination =
            safeRequestedNext && !safeRequestedNext.startsWith("/admin")
              ? safeRequestedNext
              : "/dashboard";
        }
      } catch (profileError) {
        console.error("Profile load failed:", profileError);
        destination =
          safeRequestedNext && !safeRequestedNext.startsWith("/admin")
            ? safeRequestedNext
            : "/dashboard";
      }

      if (mounted) {
        router.replace(destination);
        router.refresh();
      }
    }

    async function handleRedirectResult() {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          // User signed in via redirect. Routing has started — keep the
          // interstitial up until the destination page actually replaces
          // this one (the pathname check in render handles that), so the
          // login form never flashes back mid-sign-in.
          clearAuthRedirectPending();
          await routeSignedInUser(result.user);
          return;
        }
        // No pending redirect (direct visit, stale flag): drop the
        // interstitial immediately.
        clearAuthRedirectPending();
        setReturningFromRedirect(false);
      } catch (error) {
        console.error("Redirect result error:", error);
        // A rejected getRedirectResult does not always mean a failed sign-in:
        // Identity Toolkit can fail the post-redirect bookkeeping after the
        // session was already established (observed in production:
        // `auth/error-code:-40` right after a transient 503, with the user
        // fully signed in and Firestore streaming). When a session exists,
        // finish the normal routing instead of telling the user sign-in
        // failed and leaving them on the login page.
        const signedIn = auth.currentUser;
        if (signedIn) {
          clearAuthRedirectPending();
          await routeSignedInUser(signedIn);
          return;
        }
        // Only show error if it's not a "no redirect" error
        const err = error as { code?: string };
        if (err.code !== "auth/no-auth-event") {
          toast.error("Unable to complete sign-in. Please try again.");
        }
        clearAuthRedirectPending();
        setReturningFromRedirect(false);
      }
    }

    handleRedirectResult();

    return () => {
      mounted = false;
    };
  }, [router, safeRequestedNext]);

  if (showSignInInterstitial) return <SigningInOverlay />;

  return null;
}
