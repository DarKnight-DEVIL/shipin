import { customerApi } from "@/lib/customerApiClient";
import { toShipINError } from "@/utils/errors";

interface AnalyticsApiResponse {
  success: boolean;
  stats: DashboardStats;
  monthlyRevenue: MonthlyRevenuePoint[];
  statusDistribution: StatusDistributionPoint[];
  recentActivity: Array<{
    id: string;
    title: string;
    description: string;
    createdAt?: string;
  }>;
  topCustomers: CustomerSummary[];
  operations: OperationsOverview;
  financials: FinancialOverview;
}

async function fetchAnalytics(): Promise<AnalyticsApiResponse> {
  return customerApi<AnalyticsApiResponse>("/api/admin/analytics", {
    method: "GET",
  });
}
export interface DashboardStats {
  totalRequests: number;
  total: number;
  submitted: number;
  review: number;
  quoteReady: number;
  quoteUpdates: number;
  refundRequested: number;
  awaitingPayment: number;
  warehouse: number;
  shipped: number;
  delivered: number;
  revenue: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    const data = await fetchAnalytics();
    return data.stats;
  } catch (error) {
    throw toShipINError(error);
  }
}

export interface MonthlyRevenuePoint {
  month: string;
  revenue: number;
}

export async function getMonthlyRevenue(): Promise<MonthlyRevenuePoint[]> {
  try {
    const data = await fetchAnalytics();
    return data.monthlyRevenue;
  } catch (error) {
    throw toShipINError(error);
  }
}

export interface StatusDistributionPoint {
  name: string;
  value: number;
}

export async function getStatusDistribution(): Promise<
  StatusDistributionPoint[]
> {
  try {
    const data = await fetchAnalytics();
    return data.statusDistribution;
  } catch (error) {
    throw toShipINError(error);
  }
}

export interface RecentActivityEntry {
  id: string;
  title: string;
  description: string;
  createdAt: Date | undefined;
}

export async function getRecentActivity(): Promise<RecentActivityEntry[]> {
  try {
    const data = await fetchAnalytics();
    return data.recentActivity.map((e) => ({
      ...e,
      createdAt: e.createdAt ? new Date(e.createdAt) : undefined,
    }));
  } catch (error) {
    throw toShipINError(error);
  }
}

interface CustomerSummary {
  id: string;
  name: string;
  email: string;
  requests: number;
  revenue: number;
}

export async function getTopCustomers(): Promise<CustomerSummary[]> {
  try {
    const data = await fetchAnalytics();
    return data.topCustomers;
  } catch (error) {
    throw toShipINError(error);
  }
}

export interface OperationsOverview {
  awaitingQuote: number;
  awaitingPayment: number;
  warehouse: number;
  readyToShip: number;
  shippedToday: number;
  overdue: number;
}

export async function getOperationsOverview(): Promise<OperationsOverview> {
  try {
    const data = await fetchAnalytics();
    return data.operations;
  } catch (error) {
    throw toShipINError(error);
  }
}

export interface FinancialOverview {
  grossRevenue: number;
  serviceFees: number;
  productCost: number;
  shippingCost: number;
  paidOrders: number;
  averageOrderValue: number;
}

export async function getFinancialOverview(): Promise<FinancialOverview> {
  try {
    const data = await fetchAnalytics();
    return data.financials;
  } catch (error) {
    throw toShipINError(error);
  }
}
