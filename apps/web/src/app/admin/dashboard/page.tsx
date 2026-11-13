"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import dynamic from "next/dynamic";

const RevenueChart = dynamic(
  () => import("@/components/admin/dashboard/RevenueChart").then((mod) => mod.default),
  { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-2xl border border-slate-800 bg-slate-900" /> }
);

const StatusDistributionChart = dynamic(
  () => import("@/components/admin/dashboard/StatusDistributionChart").then((mod) => mod.default),
  { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-2xl border border-slate-800 bg-slate-900" /> }
);

const OperationsOverview = dynamic(
  () => import("@/components/admin/dashboard/OperationsOverview").then((mod) => mod.default),
  { ssr: false, loading: () => <div className="h-48 animate-pulse rounded-2xl border border-slate-800 bg-slate-900" /> }
);

const FinancialOverview = dynamic(
  () => import("@/components/admin/dashboard/FinancialOverview").then((mod) => mod.default),
  { ssr: false, loading: () => <div className="h-48 animate-pulse rounded-2xl border border-slate-800 bg-slate-900" /> }
);

const RecentActivity = dynamic(
  () => import("@/components/admin/dashboard/RecentActivity").then((mod) => mod.default),
  { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-2xl border border-slate-800 bg-slate-900" /> }
);

const TopCustomers = dynamic(
  () => import("@/components/admin/dashboard/TopCustomers").then((mod) => mod.default),
  { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-2xl border border-slate-800 bg-slate-900" /> }
);

import {
  getDashboardStats,
  getMonthlyRevenue,
  getStatusDistribution,
  getRecentActivity,
  getTopCustomers,
  getOperationsOverview,
  getFinancialOverview,
  type DashboardStats,
  type MonthlyRevenuePoint,
  type StatusDistributionPoint,
  type RecentActivityEntry,
  type OperationsOverview as OperationsOverviewData,
  type FinancialOverview as FinancialOverviewData,
} from "@/features/admin/services/analytics";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [monthlyRevenue, setMonthlyRevenue] = useState<MonthlyRevenuePoint[]>([]);
  const [statusDistribution, setStatusDistribution] =
    useState<StatusDistributionPoint[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivityEntry[]>(
    []
  );
  const [topCustomers, setTopCustomers] = useState<
    Awaited<ReturnType<typeof getTopCustomers>>
  >([]);
  const [operations, setOperations] = useState<OperationsOverviewData | null>(null);
  const [financials, setFinancials] = useState<FinancialOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const analyticsData = await getDashboardStats();
        setStats(analyticsData);

        const [revenue, distribution, activity, customers, ops, finance] =
          await Promise.all([
            getMonthlyRevenue(),
            getStatusDistribution(),
            getRecentActivity(),
            getTopCustomers(),
            getOperationsOverview(),
            getFinancialOverview(),
          ]);

        setMonthlyRevenue(revenue);
        setStatusDistribution(distribution);
        setRecentActivity(activity);
        setTopCustomers(customers);
        setOperations(ops);
        setFinancials(finance);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load dashboard data."
        );
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

  if (error || !stats) {
    return (
      <div className="min-h-screen bg-slate-950 p-8">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-8 text-center">
          <p className="text-red-400">
            {error || "Failed to load dashboard data."}
          </p>
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