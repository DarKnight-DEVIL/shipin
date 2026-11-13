"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { ArrowLeft, Inbox } from "lucide-react";

import RequestLayout from "@/components/admin/request/RequestLayout";
import RequestSidebar from "@/components/admin/request/RequestSidebar";
import NextActionCard from "@/components/admin/request/NextActionCard";
import OverviewPanel from "@/components/admin/request/panels/OverviewPanel";
import ProductsPanel from "@/components/admin/request/panels/ProductsPanel";
import WarehousePanel from "@/components/admin/request/panels/WarehousePanel";
import SupportPanel from "@/components/admin/request/panels/SupportPanel";
import TimelinePanel from "@/components/admin/request/panels/TimelinePanel";
import TrackingPanel from "@/components/admin/request/panels/TrackingPanel";
import EmptyState from "@/components/ui/EmptyState";
import { subscribeToRequest } from "@/features/requests/services/requests";
import type { Request } from "@/types/request";

/**
 * The panels that generate PDFs (quote, shipping label) or load shipment data
 * are split out of the initial bundle: an admin opening a request usually only
 * needs the overview, and react-pdf is far too heavy to ship eagerly.
 */
const panelLoading = () => (
  <div className="h-64 animate-pulse rounded-xl bg-slate-800/50" />
);

const QuotePanel = dynamic(
  () => import("@/components/admin/request/panels/QuotePanel"),
  { ssr: false, loading: panelLoading }
);

const ShipmentPanel = dynamic(
  () => import("@/components/admin/request/panels/ShipmentPanel"),
  { ssr: false, loading: panelLoading }
);

const ConsolidationPanel = dynamic(
  () => import("@/components/admin/request/panels/ConsolidationPanel"),
  { ssr: false, loading: panelLoading }
);

export default function AdminRequestDetailPage() {
  const params = useParams<{ requestId: string }>();
  const requestId = params?.requestId;

  const [request, setRequest] = useState<Request | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("Overview");

  useEffect(() => {
    if (!requestId) return;

    // A live listener rather than a one-off read: status changes from the next
    // action card, the quote panel and the shipment panel all land here without
    // a manual refresh.
    const unsubscribe = subscribeToRequest(
      requestId,
      (nextRequest) => {
        setRequest(nextRequest);
        setLoading(false);
      },
      (listenError) => {
        console.error("Failed to load request:", listenError);
        setError("Unable to load this request.");
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [requestId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-800" />
        <div className="h-96 animate-pulse rounded-2xl border border-slate-800 bg-slate-900" />
      </div>
    );
  }

  if (error || !request) {
    return (
      <EmptyState
        icon={<Inbox size={26} />}
        title={error ? "Request unavailable" : "Request not found"}
        description={
          error ??
          "This request does not exist, or it was removed. Return to the queue to pick another one."
        }
        action={
          <Link
            href="/admin/requests"
            className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-500"
          >
            <ArrowLeft size={16} />
            Back to requests
          </Link>
        }
      />
    );
  }

  function renderPanel(current: Request) {
    switch (activeTab) {
      case "Products":
        return <ProductsPanel request={current} />;
      case "Quote":
        return <QuotePanel request={current} />;
      case "Warehouse":
        return <WarehousePanel request={current} />;
      case "Shipment":
        return <ShipmentPanel request={current} />;
      case "Consolidation":
        return <ConsolidationPanel request={current} />;
      case "Support":
        return <SupportPanel request={current} />;
      case "Tracking":
        return <TrackingPanel request={current} />;
      case "Timeline":
        return <TimelinePanel request={current} />;
      default:
        return (
          <OverviewPanel
            request={current}
            onGoToQuote={() => setActiveTab("Quote")}
          />
        );
    }
  }

  return (
    <div>
      <Link
        href="/admin/requests"
        className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
      >
        <ArrowLeft size={16} />
        All requests
      </Link>

      <RequestLayout
        title={`Request #${request.id.slice(0, 6)}`}
        subtitle={request.email}
        sidebar={
          <div className="space-y-6">
            <RequestSidebar
              request={request}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
            <NextActionCard requestId={request.id} status={request.status} />
          </div>
        }
      >
        {renderPanel(request)}
      </RequestLayout>
    </div>
  );
}
