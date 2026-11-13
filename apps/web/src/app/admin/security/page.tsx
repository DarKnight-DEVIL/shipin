import type { Metadata } from "next";

import AdminSecuritySettings from "@/components/admin/security/AdminSecuritySettings";

export const metadata: Metadata = {
  title: "Security — ShipIN Admin",
  robots: { index: false, follow: false },
};

export default function AdminSecurityPage() {
  return <AdminSecuritySettings />;
}
