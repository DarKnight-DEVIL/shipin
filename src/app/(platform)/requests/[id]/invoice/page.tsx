"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { getRequestById } from "@/lib/firestore";

import LoadingCard from "@/components/ui/LoadingCard";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import InvoicePreview from "@/components/invoice/InvoicePreview";
import dynamic from "next/dynamic";

/* PayPal injects its own markup after mount — keep it off the server
   render so React never hydrates against a different tree. */
const PayPalCheckout = dynamic(
  () => import("@/components/payment/PayPalCheckout"),
  { ssr: false }
);
import ApprovalCard from "@/components/request/ApprovalCard";

import {
  buildInvoiceSummary,
} from "@/components/invoice/InvoiceSummary";

export default function InvoicePage() {
  const { id } = useParams();

  const [request, setRequest] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      if (!id) {
        setLoaded(true);
        return;
      }

      try {
        const data = await getRequestById(id as string);
        setRequest(data);
      } catch (error) {
        console.error("Invoice loading failed:", error);
        setRequest(null);
      } finally {
        setLoaded(true);
      }
    }

    load();
  }, [id]);

  if (!loaded) {
    return (
      <div className="app-page">
        <LoadingCard />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="app-page">
        <EmptyState
          title="Invoice not found"
          description="This invoice could not be opened. The link may be incomplete, or the request may have been removed."
          action={
            <Link href="/requests" className="app-btn app-btn-primary">
              Back to requests
            </Link>
          }
        />
      </div>
    );
  }

  if (!request.quote) {
    return (
      <div className="app-page">
        <div className="app-panel px-6 py-14 text-center">
          <h1 className="text-[15px] font-semibold text-[var(--foreground)]">
            Invoice not available yet
          </h1>
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            The invoice appears once your quote is ready.
          </p>
          <Link
            href={`/requests/${id}`}
            className="app-btn app-btn-secondary mt-5"
          >
            Back to request
          </Link>
        </div>
      </div>
    );
  }

  // Generate the unified invoice summary layout object
  const invoice = buildInvoiceSummary(request);

  // Step 1: Extract service selections safely after loading the request
  const inspection =
    request.serviceSelections?.inspection ?? "standard";
  const shippingPreference =
    request.serviceSelections?.shippingPreference ?? "approval";

  // Step 2: Calculate the charges context
  const inspectionFee =
    inspection === "detailed" ? 5 : 0;
  const holdFee =
    shippingPreference === "hold" ? 5 : 0;

  return (
    <div className="app-page">
      <PageHeader
        backHref={`/requests/${id}`}
        backLabel="Request"
        eyebrow="Invoice"
        title="Purchase invoice"
      />

      <div className="max-w-3xl space-y-5">
        <InvoicePreview invoice={invoice} />

        {(inspectionFee > 0 || holdFee > 0) && (
          <div className="mb-3 mt-6">
            <h3 className="text-[13px] font-semibold text-[var(--foreground)]">
              Additional services
            </h3>
          </div>
        )}

        {inspectionFee > 0 && (
          <div className="flex justify-between border-b border-[var(--border)] py-2 text-[12px] text-[var(--muted)]">
            <span>Detailed inspection</span>
            <span className="tabular-nums">$5.00</span>
          </div>
        )}

        {holdFee > 0 && (
          <div className="flex justify-between border-b border-[var(--border)] py-2 text-[12px] text-[var(--muted)]">
            <span>Hold package</span>
            <span className="tabular-nums">$5.00</span>
          </div>
        )}

        <ApprovalCard request={request} />

        {request.status !== "purchase_invoice_paid" && (
          <div className="app-panel p-5">
            <h2 className="app-section-title mb-4">Secure payment</h2>

            <PayPalCheckout
              requestId={request.id}
              amount={request.quote.grandTotal}
            />
          </div>
        )}
      </div>
    </div>
  );
}