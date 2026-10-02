"use client";

import {
  useEffect,
  useState,
} from "react";

import { useParams } from "next/navigation";

import {
  doc,
  onSnapshot,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

import type { Request } from "@/types/request";

import RequestLayout from "@/components/admin/request/RequestLayout";
import RequestSidebar from "@/components/admin/request/RequestSidebar";
import PageSkeleton from "@/components/ui/PageSkeleton";

import OverviewPanel from "@/components/admin/request/panels/OverviewPanel";
import ProductsPanel from "@/components/admin/request/panels/ProductsPanel";
import QuotePanel from "@/components/admin/request/panels/QuotePanel";
import ShipmentPanel from "@/components/admin/request/panels/ShipmentPanel";
import ConsolidationPanel from "@/components/admin/request/panels/ConsolidationPanel";
import SupportPanel from "@/components/admin/request/panels/SupportPanel";
import TimelinePanel from "@/components/admin/request/panels/TimelinePanel";
import WarehousePanel from "@/components/admin/request/panels/WarehousePanel";

export default function AdminRequestPage() {
  const params = useParams();

  const id = params.id as string;

  const [request, setRequest] =
    useState<Request | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [activeTab, setActiveTab] =
    useState("Overview");

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    const requestRef = doc(
      db,
      "requests",
      id
    );

    /*
     * Real-time listener.
     *
     * Whenever the request document changes,
     * the admin interface receives the latest
     * request automatically.
     */
    const unsubscribe = onSnapshot(
      requestRef,

      (snapshot) => {
        if (snapshot.exists()) {
          setRequest({
            id: snapshot.id,
            ...snapshot.data(),
          } as Request);
        } else {
          setRequest(null);
        }

        setLoading(false);
      },

      (error) => {
        console.error(
          "Failed to load request:",
          error
        );

        setLoading(false);
      }
    );

    /*
     * Stop listening when the admin leaves
     * this request page.
     */
    return () => {
      unsubscribe();
    };
  }, [id]);

  if (loading) {
    return <PageSkeleton />;
  }

  if (!request) {
    return (
      <div className="p-8">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8">
          <h1 className="text-xl font-semibold text-white">
            Request not found
          </h1>

          <p className="mt-2 text-slate-400">
            This request may have been deleted
            or is no longer available.
          </p>
        </div>
      </div>
    );
  }

  return (
    <RequestLayout
      title={`Request #${request.id
        .slice(0, 6)
        .toUpperCase()}`}
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
        <OverviewPanel
          request={request}
        />
      )}

      {activeTab === "Products" && (
        <ProductsPanel
          request={request}
        />
      )}

      {activeTab === "Quote" && (
        <QuotePanel
          request={request}
        />
      )}

      {activeTab === "Warehouse" && (
        <WarehousePanel
          request={request}
        />
      )}

      {activeTab === "Shipment" && (
        <ShipmentPanel
          request={request}
        />
      )}

      {activeTab === "Consolidation" && (
        <ConsolidationPanel
          request={request}
        />
      )}

      {activeTab === "Support" && (
        <SupportPanel
          request={request}
        />
      )}

      {activeTab === "Timeline" && (
        <TimelinePanel
          request={request}
        />
      )}
    </RequestLayout>
  );
}