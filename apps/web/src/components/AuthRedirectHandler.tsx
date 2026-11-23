"use client";

import { useEffect } from "react";
import { getRedirectResult } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

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
  const searchParams = useSearchParams();

  const safeRequestedNext = sameOriginPath(searchParams.get("next"));

  useEffect(() => {
    let mounted = true;

    async function handleRedirectResult() {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          // User signed in via redirect
          const user = result.user;

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
      } catch (error) {
        console.error("Redirect result error:", error);
        // Only show error if it's not a "no redirect" error
        const err = error as { code?: string };
        if (err.code !== "auth/no-auth-event") {
          toast.error("Unable to complete sign-in. Please try again.");
        }
      }
    }

    handleRedirectResult();

    return () => {
      mounted = false;
    };
  }, [router, safeRequestedNext]);

  return null;
}
