"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, getDocs } from "firebase/firestore";
import { LayoutDashboard } from "lucide-react";

import { db } from "@/lib/firebase";
import { 
  getDashboardStats, 
  getMonthlyRevenue, 
  getStatusDistribution,
  getRecentActivity,
  getTopCustomers,
  getOperationsOverview,
  getFinancialOverview
} from "@/lib/adminAnalytics";

import RevenueChart from "@/components/admin/dashboard/RevenueChart";
import StatusDistributionChart from "@/components/admin/dashboard/StatusDistributionChart";
import RecentActivity from "@/components/admin/dashboard/RecentActivity";
import TopCustomers from "@/components/admin/dashboard/TopCustomers";
import OperationsOverview from "@/components/admin/dashboard/OperationsOverview";
import FinancialOverview from "@/components/admin/dashboard/FinancialOverview";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState({
    total: 0,
    submitted: 0,
    review: 0,
    quoteReady: 0,
    quoteUpdates: 0,
    refundRequested: 0,
    shipped: 0,
    revenue: 0,
    awaitingPayment: 0,
    warehouse: 0,
    delivered: 0
  });

  const [monthlyRevenue, setMonthlyRevenue] = useState<any[]>([]);
  const [statusDistribution, setStatusDistribution] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [topCustomers, setTopCustomers] = useState<any[]>([]);
  const [operations, setOperations] = useState<any>(null);
  const [financials, setFinancials] = useState<any>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const querySnapshot = await getDocs(collection(db, "requests"));
        const requests = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as any[];

        const analyticsData = await getDashboardStats();

        setStats({
          total: requests.length,

          submitted: requests.filter(
            (r: any) => r.status === "submitted"
          ).length,

          review: requests.filter(
            (r: any) => r.status === "review"
          ).length,

          quoteReady: requests.filter(
            (r: any) => r.status === "review"
          ).length,

          quoteUpdates: requests.filter(
            (r: any) =>
              r.quoteRegenerationRequested === true &&
              r.status !== "rejected"
          ).length,

          refundRequested: requests.filter(
            (r: any) => r.refundRequest?.status === "requested"
          ).length,

          shipped: requests.filter(
            (r: any) => r.status === "shipped"
          ).length,
          
          revenue: analyticsData.revenue ?? 0,
          awaitingPayment: analyticsData.awaitingPayment ?? 0,
          warehouse: analyticsData.warehouse ?? 0,
          delivered: analyticsData.delivered ?? 0
        });

        const revenue = await getMonthlyRevenue();
        setMonthlyRevenue(revenue);

        const distribution = await getStatusDistribution();
        setStatusDistribution(distribution);

        const activity = await getRecentActivity();
        setRecentActivity(activity);

        const customers = await getTopCustomers();
        setTopCustomers(customers);

        const ops = await getOperationsOverview();
        setOperations(ops);

        const finance = await getFinancialOverview();
        setFinancials(finance);
      } catch (error) {
        console.error("Error loading dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 p-8 text-white">
        <div className="space-y-6">
          <div className="h-10 w-64 animate-pulse rounded-xl bg-slate-800" />

          <div className="h-5 w-96 animate-pulse rounded-lg bg-slate-800" />

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="h-32 animate-pulse rounded-2xl border border-slate-800 bg-slate-900"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-950 p-8 space-y-8 text-white">

      <div>
        <h1 className="text-4xl font-bold text-white">
          Admin Dashboard
        </h1>
        <p className="text-slate-400 mt-2">
          Real-time overview of ShipIN operations
        </p>
      </div>

      {stats.total === 0 ? (
        <div className="flex min-h-[400px] items-center justify-center rounded-2xl border border-slate-800 bg-slate-900">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-slate-400">
              <LayoutDashboard size={26} />
            </div>

            <h2 className="text-xl font-semibold text-white">
              Nothing to show yet
            </h2>

            <p className="mt-2 max-w-md text-sm text-slate-400">
              There is currently no activity or data available for the selected view.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* TOP-LEVEL METRIC CARDS */}
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">

            <Link
              href="/admin/requests"
              className="block rounded-2xl border border-slate-800 bg-slate-900 p-6 transition hover:border-green-500/40 hover:bg-slate-800"
            >
              <h2 className="text-slate-400">
                Revenue
              </h2>
              <p className="mt-2 text-4xl font-bold text-white">
                ${stats.revenue.toFixed(2)}
              </p>
            </Link>

            <Link
              href="/admin/requests"
              className="block rounded-2xl border border-slate-800 bg-slate-900 p-6 transition hover:border-slate-600 hover:bg-slate-800"
            >
              <h2 className="text-slate-400">
                Total Requests
              </h2>
              <p className="mt-2 text-4xl font-bold text-white">
                {stats.total}
              </p>
            </Link>

            <Link
              href="/admin/requests?status=awaiting_payment"
              className="block rounded-2xl border border-slate-800 bg-slate-900 p-6 transition hover:border-amber-500/40 hover:bg-slate-800"
            >
              <h2 className="text-slate-400">
                Awaiting Payment
              </h2>
              <p className="mt-2 text-4xl font-bold text-white">
                {stats.awaitingPayment}
              </p>
            </Link>

            <Link
              href="/admin/requests?status=warehouse_received"
              className="block rounded-2xl border border-slate-800 bg-slate-900 p-6 transition hover:border-blue-500/40 hover:bg-slate-800"
            >
              <h2 className="text-slate-400">
                Warehouse
              </h2>
              <p className="mt-2 text-4xl font-bold text-white">
                {stats.warehouse}
              </p>
            </Link>

            <Link
              href="/admin/requests?status=submitted"
              className="block rounded-2xl border border-slate-800 bg-slate-900 p-6 transition hover:border-blue-500/40 hover:bg-slate-800"
            >
              <h2 className="text-slate-400">
                Submitted
              </h2>
              <p className="mt-2 text-4xl font-bold text-white">
                {stats.submitted}
              </p>
            </Link>

            <Link
              href="/admin/requests?status=review"
              className="block rounded-2xl border border-slate-800 bg-slate-900 p-6 transition hover:border-blue-500/40 hover:bg-slate-800"
            >
              <h2 className="text-slate-400">
                Under Review
              </h2>
              <p className="mt-2 text-4xl font-bold text-white">
                {stats.review}
              </p>
            </Link>

            <Link
              href="/admin/requests?status=review"
              className="block rounded-2xl border border-slate-800 bg-slate-900 p-6 transition hover:border-green-500/40 hover:bg-slate-800"
            >
              <h2 className="text-slate-400">
                Quotes Ready
              </h2>
              <p className="mt-2 text-4xl font-bold text-white">
                {stats.quoteReady}
              </p>
            </Link>

            <Link
              href="/admin/requests?status=quote_requested"
              className="block rounded-2xl border border-slate-800 bg-slate-900 p-6 transition hover:border-amber-500/50 hover:bg-slate-800"
            >
              <h2 className="text-slate-400">
                Quote Updates
              </h2>
              <p className="mt-2 text-4xl font-bold text-white">
                {stats.quoteUpdates}
              </p>
            </Link>

            <Link
              href="/admin/requests?status=refund_requested"
              className="block rounded-2xl border border-red-500/30 bg-slate-900 p-6 transition hover:border-red-500/60 hover:bg-red-950/20"
            >
              <h2 className="text-red-400">
                Refund Requests
              </h2>

              <p className="mt-2 text-4xl font-bold text-white">
                {stats.refundRequested}
              </p>

              <p className="mt-2 text-xs text-slate-500">
                Requires admin action
              </p>
            </Link>

            <Link
              href="/admin/requests?status=shipped"
              className="block rounded-2xl border border-slate-800 bg-slate-900 p-6 transition hover:border-purple-500/50 hover:bg-slate-800"
            >
              <h2 className="text-slate-400">
                Shipped
              </h2>
              <p className="mt-2 text-4xl font-bold text-white">
                {stats.shipped}
              </p>
            </Link>

            <Link
              href="/admin/requests?status=delivered"
              className="block rounded-2xl border border-slate-800 bg-slate-900 p-6 transition hover:border-green-500/50 hover:bg-slate-800"
            >
              <h2 className="text-slate-400">
                Delivered
              </h2>
              <p className="mt-2 text-4xl font-bold text-white">
                {stats.delivered}
              </p>
            </Link>

          </div>

          {operations && (
            <OperationsOverview
              stats={operations}
            />
          )}

          {financials && (
            <FinancialOverview
              stats={financials}
            />
          )}

          <div className="grid xl:grid-cols-2 gap-6">
            <RevenueChart data={monthlyRevenue} />
            <StatusDistributionChart data={statusDistribution} />
          </div>

          <RecentActivity activities={recentActivity} />
          <TopCustomers customers={topCustomers} />
        </>
      )}

    </div>
  );
}