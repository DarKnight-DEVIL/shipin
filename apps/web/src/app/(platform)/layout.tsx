"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { auth } from "@/lib/firebase";
import PlatformShell from "@/components/platform/PlatformShell";
import { AppCheckBanner, ErrorBoundary, RetryNotice } from "@/components/ui";
import PlatformLoading from "./loading";
import "@/styles/app-theme.css";
import { useAxeScan } from "@/lib/axeScan";

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  // Seeded from the current session so a page that is already signed in does
  // not render once before the listener fires.
  const [signedInUid, setSignedInUid] = useState<string | null>(
    () => auth.currentUser?.uid ?? null
  );
  const [readyUid, setReadyUid] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setUserName("");
        setUserEmail("");
        setSignedInUid(null);
        setReadyUid(null);
        return;
      }

      setUserName(
        user.displayName || user.email?.split("@")[0] || "ShipIN customer"
      );
      setUserEmail(user.email || "");

      // Email verification enforcement (#4).
      if (!user.emailVerified && !pathname.startsWith("/verify-email")) {
        router.replace("/verify-email");
      }

      setSignedInUid(user.uid);

      try {
        // Imported here, not at module scope: the profile service pulls in the
        // Firestore SDK, and the shell is the first thing every platform route
        // renders.
        const { ensureUserProfile } =
          await import("@/features/users/services/userProfile");
        // Google sign-in never passes through registration, so an account can
        // authenticate while having no `users/{uid}` document. Every API route
        // then answers 403 USER_PROFILE_NOT_FOUND, which looks like a broken
        // dashboard rather than a missing profile.
        //
        // No local "already repaired" flag: the service caches the repair per
        // account, so the navigation that follows sign-in joins the lookup the
        // login page already made instead of reading Firestore a second time,
        // and later navigations resolve from the same cache.
        await ensureUserProfile({
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          photoURL: user.photoURL,
        });
      } catch (error) {
        // ensureUserProfile already logs its own failures; this only catches a
        // failed dynamic import. The screen still renders — apiFetch retries
        // once on USER_PROFILE_NOT_FOUND.
        console.error("[profile] Layout repair failed:", error);
      }

      if (!cancelled) setReadyUid(user.uid);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [router, pathname]);

  // Accessibility scan. This must be called at the top level of the component:
  // it is a hook (it uses useRef/useEffect), so calling it from inside a
  // useEffect threw "Invalid hook call" and crashed every authenticated page
  // into the error boundary. The hook is a development-only diagnostic and
  // returns before importing axe-core in production builds.
  useAxeScan({ level: "aa", maxViolations: 10 });

  // Child effects run before the layout's, so without this gate a page issues
  // its first API call while the repair is still in flight. Signed-out visitors
  // are unaffected: they render as before, and every data route rejects them.
  const profileReady = !signedInUid || readyUid === signedInUid;

  return (
    <ErrorBoundary title="Dashboard unavailable">
      <PlatformShell userName={userName} userEmail={userEmail}>
        {/* Fixed-position: rendered here so every authenticated page reports
            an App Check rejection the same way, whatever its own error copy. */}
        <AppCheckBanner />
        {profileReady ? (
          <>
            {/* Inline, so a backoff in progress does not look like a stall. */}
            <RetryNotice />
            {children}
          </>
        ) : (
          <PlatformLoading />
        )}
      </PlatformShell>
    </ErrorBoundary>
  );
}
// Brand, NavItem, Sidebar, UserAvatar extracted to src/components/platform/*.tsx
