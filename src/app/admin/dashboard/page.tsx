"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState({
    total: 0,
    submitted: 0,
    review: 0,
    payment: 0,
    shipped: 0,
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const snapshot = await getDocs(
          collection(db, "requests")
        );

        const requests = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setStats({
          total: requests.length,

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
      } catch (error) {
        console.error(error);
      }

      setLoading(false);
    };

    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="text-white p-8">
        Loading dashboard...
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold text-white mb-8">
        Admin Dashboard
      </h1>

      <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-6">
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <h2 className="text-slate-400">Total Requests</h2>
          <p className="text-4xl font-bold mt-2 text-white">
            {stats.total}
          </p>
        </div>

        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <h2 className="text-slate-400">Submitted</h2>
          <p className="text-4xl font-bold mt-2 text-white">
            {stats.submitted}
          </p>
        </div>

        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <h2 className="text-slate-400">Under Review</h2>
          <p className="text-4xl font-bold mt-2 text-white">
            {stats.review}
          </p>
        </div>

        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <h2 className="text-slate-400">Awaiting Payment</h2>
          <p className="text-4xl font-bold mt-2 text-white">
            {stats.payment}
          </p>
        </div>

        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <h2 className="text-slate-400">Shipped</h2>
          <p className="text-4xl font-bold mt-2 text-white">
            {stats.shipped}
          </p>
        </div>
      </div>
    </div>
  );
}