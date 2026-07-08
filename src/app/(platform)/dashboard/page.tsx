"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { getRequests } from "@/lib/firestore";
import Link from "next/link";

export default function DashboardPage() {
  const [stats, setStats] = useState({
    submitted: 0,
    review: 0,
    payment: 0,
    shipped: 0,
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }

      const requests = await getRequests(user.uid);

      setStats({
        submitted: requests.filter(
          (r: any) => r.status === "submitted"
        ).length,

        review: requests.filter(
          (r: any) => r.status === "review"
        ).length,

        payment: requests.filter(
          (r: any) => r.status === "payment"
        ).length,

        shipped: requests.filter(
          (r: any) => r.status === "shipped"
        ).length,
      });

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="p-8 text-white">
        Loading dashboard...
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold text-white mb-8">
        Dashboard
      </h1>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <h2 className="text-slate-400">
            Open Requests
          </h2>

          <p className="text-4xl font-bold mt-2 text-white">
            {stats.submitted}
          </p>
        </div>

        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <h2 className="text-slate-400">
            Under Review
          </h2>

          <p className="text-4xl font-bold mt-2 text-white">
            {stats.review}
          </p>
        </div>

        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <h2 className="text-slate-400">
            Awaiting Payment
          </h2>

          <p className="text-4xl font-bold mt-2 text-white">
            {stats.payment}
          </p>
        </div>

        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <h2 className="text-slate-400">
            Shipped
          </h2>

          <p className="text-4xl font-bold mt-2 text-white">
            {stats.shipped}
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-2 gap-6">
        <Link
          href="/requests/new"
          className="bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:border-purple-500 transition"
        >
          <h2 className="text-2xl font-semibold text-white mb-2">
            Create Request
          </h2>

          <p className="text-slate-400">
            Submit a new purchase request.
          </p>
        </Link>

        <Link
          href="/requests"
          className="bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:border-purple-500 transition"
        >
          <h2 className="text-2xl font-semibold text-white mb-2">
            View Requests
          </h2>

          <p className="text-slate-400">
            Track your existing orders.
          </p>
        </Link>
      </div>
    </div>
  );
}