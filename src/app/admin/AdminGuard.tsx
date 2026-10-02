"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";

import { auth } from "@/lib/firebase";
import { getUserProfile } from "@/lib/userProfile";

export default function AdminGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [checking, setChecking] =
    useState(true);

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (user) => {
          try {
            /*
             * No Firebase user
             */
            if (!user) {
              router.replace(
                `/login?next=${encodeURIComponent(
                  pathname
                )}`
              );

              return;
            }

            /*
             * Get ShipIN profile
             */
            const profile =
              await getUserProfile(
                user.uid
              );

            /*
             * User is authenticated but
             * does not have admin privileges.
             */
            if (
              profile?.role !== "admin"
            ) {
              router.replace(
                "/dashboard"
              );

              return;
            }

            /*
             * User is an admin.
             */
            setChecking(false);
          } catch (error) {
            console.error(
              "Admin authorization check failed:",
              error
            );

            router.replace(
              "/dashboard"
            );
          }
        }
      );

    return () => unsubscribe();
  }, [router, pathname]);

  /*
   * Don't render admin content while
   * authorization is being checked.
   */
  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-purple-400" />

          <p className="text-sm text-slate-400">
            Verifying administrator access...
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}