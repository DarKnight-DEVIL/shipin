"use client";

import { useState } from "react";
import { pdf } from "@react-pdf/renderer";

import type { Request } from "@/types/request";
import Section from "@/components/ui/Section";
import ActionButton from "@/components/ui/ActionButton";
import InvoicePreview from "@/components/invoice/InvoicePreview";
import InvoicePDF from "@/components/invoice/InvoicePDF";

import { calculateServiceFeeFromConfig } from "@/lib/quoteCalculator";
import { buildInvoiceSummary } from "@/components/invoice/InvoiceSummary";

interface Props {
  request: Request;
}

export default function QuotePanel({ request }: Props) {
  const items = request.items || [];

  // Initialize the central invoice summary structure
  const invoice = buildInvoiceSummary(request);

  // Track if a quote already exists for editing/updating
  const existingQuote = request.quote;

  const [products, setProducts] = useState(
    existingQuote?.items ??
      items.map((item) => ({
        ...item,
        unitPrice: 0,
        subtotal: 0,
      }))
  );

  // Step 1: Initialize service selections right below quote state
  const inspection =
    request.serviceSelections?.inspection ??
    "standard";
  const shippingPreference =
    request.serviceSelections
      ?.shippingPreference ??
    "approval";

  const [domesticShipping, setDomesticShipping] = useState(
    existingQuote?.breakdown?.domesticShipping ?? 0
  );
  const [internationalShipping, setInternationalShipping] = useState(
    existingQuote?.breakdown?.internationalShipping ?? 0
  );
  
  const [saving, setSaving] = useState(false);

  const productsTotal = products.reduce(
    (sum: number, item) =>
      sum + item.quantity * (item.unitPrice || 0),
    0
  );

  // Global Config Driven Service Fee calculation reference
  const serviceFee = calculateServiceFeeFromConfig(
    request.serviceSelections
  );

  // Step 2: Calculate inspectionFee and holdFee after totals are set
  const inspectionFee =
    inspection === "detailed"
      ? 5
      : 0;
  const holdFee =
    shippingPreference === "hold"
      ? 5
      : 0;

  // Step 3 & 4: Safe explicit typecast formatting grandTotal calculation
  const grandTotal =
    Number(productsTotal) +
    Number(domesticShipping) +
    Number(internationalShipping) +
    Number(serviceFee) +
    Number(inspectionFee) +
    Number(holdFee);

  async function downloadInvoice() {
    const blob = await pdf(
      <InvoicePDF invoice={invoice} />
    ).toBlob();

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Invoice-${request.id}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function saveQuote() {
    setSaving(true);

    try {
      const quote = {
        version: 1,

        items: products.map((item: any) => ({
          ...item,

          subtotal:
            item.quantity *
            (item.unitPrice || 0),
        })),

        breakdown: {
          productsTotal,
          domesticShipping,
          internationalShipping,
          serviceFee,
          inspectionFee,
          holdFee,
          grandTotal,
        },

        createdAt: new Date(),

        expiresAt: new Date(
          Date.now() +
            24 * 60 * 60 * 1000
        ),

        acceptedAt: null,

        regeneratedCount: 0,

        expired: false,
      };

      const response = await fetch(
        `/api/requests/${request.id}/quote`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            quote,
          }),
        }
      );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            "Failed to save quote."
        );
      }

      alert(
        "Quote saved successfully!"
      );
    } catch (error) {
      console.error(
        "Save quote failed:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "Failed to save quote."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      title="Purchase Invoice"
      subtitle="Create customer invoice"
    >
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        
        {/* LEFT */}
        <div className="space-y-6">
          {/* Product Prices */}
          {products.map((item, index) => (
            <div
              key={index}
              className="bg-slate-800 rounded-xl p-5"
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-white font-semibold">
                    {item.name}
                  </h3>
                  <p className="text-slate-400 text-sm">
                    Quantity: {item.quantity}
                  </p>
                </div>

                {/* Updated Unit Price Input and Subtotal Preview Layout */}
                <div className="flex items-center gap-6">
                  <div className="flex flex-col">
                    <label className="text-xs text-slate-500 mb-1">
                      Unit Price ($)
                    </label>
                    <input
                      type="number"
                      value={item.unitPrice || ""}
                      onChange={(e) => {
                        const copy = [...products];
                        copy[index].unitPrice = Number(e.target.value);
                        setProducts(copy);
                      }}
                      className="w-28 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white"
                    />
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-slate-500">
                      Subtotal
                    </p>
                    <p className="text-lg font-semibold text-green-400">
                      ${(item.quantity * (item.unitPrice || 0)).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <hr className="border-slate-700" />

          <CostField
            label="Domestic Shipping"
            value={domesticShipping}
            setValue={setDomesticShipping}
          />

          <CostField
            label="International Shipping"
            value={internationalShipping}
            setValue={setInternationalShipping}
          />

          {/* Updated Breakdown Summary Area */}
          <div className="bg-slate-800 rounded-xl p-6 space-y-4">
            <SummaryRow
              label="Products Total"
              value={productsTotal}
            />
            
            {/* Step 5: Inline Custom Selection Structural Elements added */}
            <div className="flex justify-between text-slate-400 text-sm">
              <span>Sidebar - Inspection</span>
              <span>
                $
                {request.serviceSelections?.inspection === "detailed"
                  ? 5
                  : 0}
              </span>
            </div>

            <div className="flex justify-between text-slate-400 text-sm">
              <span>Hold Package</span>
              <span>
                $
                {request.serviceSelections?.shippingPreference === "hold"
                  ? 5
                  : 0}
              </span>
            </div>

            <div className="flex justify-between font-semibold text-white">
              <span>Service Fees</span>
              <span>${serviceFee}</span>
            </div>

            <SummaryRow
              label="Domestic Shipping"
              value={domesticShipping}
            />
            <SummaryRow
              label="International Shipping"
              value={internationalShipping}
            />

            {inspectionFee > 0 && (
              <SummaryRow
                label="Detailed Inspection"
                value={inspectionFee}
              />
            )}

            {holdFee > 0 && (
              <SummaryRow
                label="Hold Package"
                value={holdFee}
              />
            )}

            <hr className="border-slate-700" />

            <div className="flex justify-between">
              <span className="text-xl font-bold text-white">
                Grand Total
              </span>
              <span className="text-2xl font-bold text-green-400">
                ${grandTotal.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Context-Aware Dynamic Save/Action Panel */}
          <div className="flex gap-3 mt-8">
            <ActionButton
              loading={saving}
              onClick={saveQuote}
              className="flex-1"
            >
              {request.quote?.regenerationRequested
                ? "Generate New Quote"
                : "Save Quote"}
            </ActionButton>

            <ActionButton
              variant="secondary"
              onClick={downloadInvoice}
              className="flex-1"
            >
              📄 Download Invoice
            </ActionButton>
          </div>
        </div>

        {/* RIGHT */}
        <InvoicePreview invoice={invoice} />

      </div>
    </Section>
  );
}

function CostField({
  label,
  value,
  setValue,
}: {
  label: string;
  value: number;
  setValue: (value: number) => void;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-slate-300">
        {label}
      </span>
      <input
        type="number"
        value={value || ""}
        onChange={(e) => setValue(Number(e.target.value))}
        className="w-28 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white"
      />
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">
        {label}
      </span>
      <span className="text-white font-medium">
        ${value.toFixed(2)}
      </span>
    </div>
  );
}