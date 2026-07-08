"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getRequestById } from "@/lib/firestore";

import RequestLayout from "@/components/admin/request/RequestLayout";
import RequestSidebar from "@/components/admin/request/RequestSidebar";
import LoadingCard from "@/components/ui/LoadingCard";

import OverviewPanel from "@/components/admin/request/panels/OverviewPanel";
import ProductsPanel from "@/components/admin/request/panels/ProductsPanel";
import QuotePanel from "@/components/admin/request/panels/QuotePanel";
import ShipmentPanel from "@/components/admin/request/panels/ShipmentPanel";
import SupportPanel from "@/components/admin/request/panels/SupportPanel";
import TimelinePanel from "@/components/admin/request/panels/TimelinePanel";

export default function AdminRequestPage() {
  const { id } = useParams();

  const [request, setRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("Overview");

  useEffect(() => {
    async function loadRequest() {
      if (!id) return;

      try {
        const data = await getRequestById(id as string);
        setRequest(data);
      } finally {
        setLoading(false);
      }
    }

    loadRequest();
  }, [id]);

  if (loading || !request) {
    return <LoadingCard />;
  }

  return (
    <RequestLayout
      title={`Request #${request.id.slice(0, 6)}`}
      subtitle={request.email}
      sidebar={
        <RequestSidebar
          request={request}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      }
    >
      {activeTab === "Overview" && (
        <OverviewPanel request={request} />
      )}

      {activeTab === "Products" && (
        <ProductsPanel request={request} />
      )}

      {activeTab === "Quote" && (
        <QuotePanel request={request} />
      )}

      {activeTab === "Shipment" && (
        <ShipmentPanel request={request} />
      )}

      {activeTab === "Support" && (
        <SupportPanel request={request} />
      )}

      {activeTab === "Timeline" && (
        <TimelinePanel request={request} />
      )}
    </RequestLayout>
  );
}