"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bricolage_Grotesque } from "next/font/google";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";
import Sidebar from "./Sidebar";
import { auth } from "@/lib/firebase";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

interface PlatformShellProps {
  children: React.ReactNode;
  /** Current user name (provided by parent layout's auth subscription). */
  userName: string;
  /** Current user email (provided by parent layout's auth subscription). */
  userEmail: string;
}

export default function PlatformShell({
  children,
  userName,
  userEmail,
}: PlatformShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const unreadCount = useUnreadNotifications();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    // Close mobile drawer after every navigation — safe to reset state here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileOpen(false);
  }, [pathname]);

  async function handleLogout() {
    try {
      await signOut(auth);
      router.replace("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }

  return (
    <main className={`shipin-app ${display.variable} min-h-screen bg-[var(--background)] text-[var(--foreground)]`}>
      <Sidebar
        pathname={pathname}
        unreadCount={unreadCount}
        userName={userName}
        userEmail={userEmail}
        mobileOpen={mobileOpen}
        onOpenMobile={() => setMobileOpen(true)}
        onCloseMobile={() => setMobileOpen(false)}
        onLogout={handleLogout}
      />
      <section className="min-h-screen md:pl-[248px]">
        <div className="shipin-page">{children}</div>
      </section>
    </main>
  );
}