"use client";

import AdminSupportSidebar from "@/components/admin/dashboard/AdminSupportSidebar";

export default function AdminSupportPage() {
  return (
    <div className="min-h-full bg-slate-950 p-8 text-white">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">
          Support
        </h1>

        <p className="mt-2 text-slate-400">
          Manage customer support conversations
          and respond to requests.
        </p>
      </div>

      <AdminSupportSidebar />
    </div>
  );
}