"use client";

import { useEffect } from "react";
import { getRedirectResult } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

export default function AuthRedirectHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const requestedNext = searchParams.get("next");
  const safeRequestedNext =
    requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : null;

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
            const { getUserProfile } = await import(
              "@/features/users/services/userProfile"
            );
            const profile = await getUserProfile(user.uid);
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