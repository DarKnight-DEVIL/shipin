"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { getRequestById } from "@/lib/firestore";

import LoadingCard from "@/components/ui/LoadingCard";
import InvoicePreview from "@/components/invoice/InvoicePreview";
import PayPalCheckout from "@/components/payment/PayPalCheckout";
import ApprovalCard from "@/components/request/ApprovalCard";

export default function InvoicePage() {
  const { id } = useParams();

  const [request, setRequest] = useState<any>(null);

  useEffect(() => {
    async function load() {
      if (!id) return;

      const data = await getRequestById(id as string);

      setRequest(data);
    }

    load();
  }, [id]);

  if (!request) {
    return <LoadingCard />;
  }

  if (!request.quote) {
    return (
      <div className="p-8 text-white">
        Invoice not available yet.
      </div>
    );
  }

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
    <div className="max-w-6xl mx-auto p-8 space-y-8">

      <InvoicePreview
        invoice={{
          id: request.id.slice(0, 8),
          ...request.quote,
          email: request.email,
          customerName: request.name,
          requestId: request.id,
        }}
      />

      {/* Step 4: Add a heading if any extra fees apply */}
      {(inspectionFee > 0 || holdFee > 0) && (
        <div className="mt-8 mb-3">
          <h3 className="text-lg font-semibold text-white">
            Additional Services
          </h3>
        </div>
      )}

      {/* Step 3: Add an "Additional Services" data rows markup layout block */}
      {inspectionFee > 0 && (
        <div className="flex justify-between py-2 border-b border-slate-800 text-slate-300">
          <span>Detailed Inspection</span>
          <span>$5.00</span>
        </div>
      )}

      {holdFee > 0 && (
        <div className="flex justify-between py-2 border-b border-slate-800 text-slate-300">
          <span>Hold Package</span>
          <span>$5.00</span>
        </div>
      )}

      <ApprovalCard
        request={request}
      />

      {request.status !== "purchase_invoice_paid" && (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6">

          <h2 className="text-2xl font-bold text-white mb-4">
            Secure Payment
          </h2>

          <PayPalCheckout
            requestId={request.id}
            amount={request.quote.grandTotal}
          />

        </div>
      )}

    </div>
  );
}