"use client";

import { useEffect, useState } from "react";

import { 
  getDashboardStats, 
  getMonthlyRevenue, 
  getStatusDistribution,
  getRecentActivity,
  getTopCustomers,
  getOperationsOverview,
  getFinancialOverview
} from "@/lib/adminAnalytics";
// Import collection fetching items if explicit client-side local arrays are calculated
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

import KPICard from "@/components/admin/dashboard/KPICard";
import RevenueChart from "@/components/admin/dashboard/RevenueChart";
import StatusDistributionChart from "@/components/admin/dashboard/StatusDistributionChart";
import RecentActivity from "@/components/admin/dashboard/RecentActivity";
import TopCustomers from "@/components/admin/dashboard/TopCustomers";
import OperationsOverview from "@/components/admin/dashboard/OperationsOverview";
import FinancialOverview from "@/components/admin/dashboard/FinancialOverview";

export default function AdminDashboardPage() {
  // Step 6.1 — Updated state structure setup configuration layout
  const [stats, setStats] = useState({
    total: 0,
    submitted: 0,
    review: 0,
    quoteReady: 0,
    quoteUpdates: 0,
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
        // Fetch raw request elements to safely perform client filters
        const querySnapshot = await getDocs(collection(db, "requests"));
        const requests = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as any[];

        const analyticsData = await getDashboardStats();

        // Step 6.2 — Calculate explicit state filters
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
            (r: any) => r.quote?.regenerationRequested
          ).length,

          shipped: requests.filter(
            (r: any) => r.status === "shipped"
          ).length,
          
          // Preserving original analytics numbers seamlessly below
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
      <div className="p-8 text-white">
        Loading dashboard...
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">

      <div>
        <h1 className="text-4xl font-bold text-white">
          Admin Dashboard
        </h1>
        <p className="text-slate-400 mt-2">
          Real-time overview of ShipIN operations
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">

        <KPICard
          title="Revenue"
          value={`$${stats.revenue.toFixed(2)}`}
          color="text-green-400"
        />

        {/* Total Requests Card */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <h2 className="text-slate-400">Total Requests</h2>
          <p className="text-4xl font-bold mt-2 text-white">{stats.total}</p>
        </div>

        <KPICard
          title="Awaiting Payment"
          value={stats.awaitingPayment}
          color="text-amber-400"
        />

        <KPICard
          title="Warehouse"
          value={stats.warehouse}
          color="text-blue-400"
        />

        {/* Submitted Card */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <h2 className="text-slate-400">Submitted</h2>
          <p className="text-4xl font-bold mt-2 text-white">{stats.submitted}</p>
        </div>

        {/* Under Review Card */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <h2 className="text-slate-400">Under Review</h2>
          <p className="text-4xl font-bold mt-2 text-white">{stats.review}</p>
        </div>

        {/* Quotes Ready Card */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <h2 className="text-slate-400">Quotes Ready</h2>
          <p className="text-4xl font-bold mt-2 text-white">{stats.quoteReady}</p>
        </div>

        {/* Step 6.3 — Added Quote Updates structural card component block layout */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-amber-500/20">
          <h2 className="text-amber-400">
            Quote Updates
          </h2>
          <p className="text-4xl font-bold mt-2 text-white">
            {stats.quoteUpdates}
          </p>
        </div>

        {/* Shipped Card */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <h2 className="text-purple-400">Shipped</h2>
          <p className="text-4xl font-bold mt-2 text-white">{stats.shipped}</p>
        </div>

        <KPICard
          title="Delivered"
          value={stats.delivered}
          color="text-green-400"
        />

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

    </div>
  );
}