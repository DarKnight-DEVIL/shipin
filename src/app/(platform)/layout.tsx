"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { auth } from "@/lib/firebase";
import PlatformShell from "@/components/platform/PlatformShell";
import "./app-theme.css";

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        setUserName("");
        setUserEmail("");
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
    });

    return () => unsubscribe();
  }, [router, pathname]);

  return (
    <PlatformShell userName={userName} userEmail={userEmail}>
      {children}
    </PlatformShell>
  );
}
// Brand, NavItem, Sidebar, UserAvatar extracted to src/components/platform/*.tsx