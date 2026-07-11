"use client";

import { useState } from "react";
import { pdf } from "@react-pdf/renderer";

import type { Request } from "@/types/request";
import Section from "@/components/ui/Section";
import ActionButton from "@/components/ui/ActionButton";
import InvoicePreview from "@/components/invoice/InvoicePreview";
import InvoicePDF from "@/components/invoice/InvoicePDF";

import { saveDetailedQuote } from "@/lib/firestore";
import { calculateServiceFee } from "@/utils/calculateServiceFee";

interface Props {
  request: Request;
}

export default function QuotePanel({ request }: Props) {
  const items = request.items || [];

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
    existingQuote?.breakdown.domesticShipping ?? 0
  );
  const [internationalShipping, setInternationalShipping] = useState(
    existingQuote?.breakdown.internationalShipping ?? 0
  );
  
  const [saving, setSaving] = useState(false);

  const productsTotal = products.reduce(
    (sum: number, item) =>
      sum + item.quantity * (item.unitPrice || 0),
    0
  );

  const {
    fee: serviceFee,
    manualQuote,
    rule,
  } = calculateServiceFee(productsTotal);

  // Step 2: Calculate inspectionFee and holdFee after totals are set
  const inspectionFee =
    inspection === "detailed"
      ? 5
      : 0;
  const holdFee =
    shippingPreference === "hold"
      ? 5
      : 0;

  // Step 3: Updated grandTotal calculation
  const grandTotal =
    productsTotal +
    domesticShipping +
    internationalShipping +
    serviceFee +
    inspectionFee +
    holdFee;

  async function downloadInvoice() {
    const blob = await pdf(
      <InvoicePDF
        invoice={{
          id: request.id,
          items: products.map((item) => ({
            ...item,
            subtotal: item.quantity * (item.unitPrice || 0),
          })),
          productsTotal,
          domesticShipping,
          internationalShipping,
          serviceFee,
          grandTotal,
        }}
      />
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
      await saveDetailedQuote(request.id, {
        version: 1,

        items: products.map((item: any) => ({
          ...item,
          subtotal: item.quantity * (item.unitPrice || 0),
        })),

        // Step 4: Include extra fees in the saved database breakdown
        breakdown: {
          productsTotal,
          domesticShipping,
          internationalShipping,
          serviceFee,
          inspectionFee,
          holdFee,
          grandTotal,
        },

        serviceFeeRule: rule,
      });

      alert("Quote saved successfully!");
    } catch (error) {
      console.error(error);
      alert("Failed to save quote.");
    }

    setSaving(false);
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
            <SummaryRow
              label="Domestic Shipping"
              value={domesticShipping}
            />
            <SummaryRow
              label="International Shipping"
              value={internationalShipping}
            />
            <SummaryRow
              label={`Service Fee (${rule})`}
              value={serviceFee}
            />

            {/* Step 5: Render additional fee breakdown elements dynamically before Grand Total */}
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
              disabled={manualQuote}
              onClick={saveQuote}
              className="flex-1"
            >
              {manualQuote ? "Manual Quote Required" : "💾 Save"}
            </ActionButton>

            <ActionButton
              variant="secondary"
              disabled={manualQuote}
              onClick={downloadInvoice}
              className="flex-1"
            >
              {manualQuote ? "Unavailable" : "📄 Download Invoice"}
            </ActionButton>
          </div>
        </div>

        {/* RIGHT */}
        <InvoicePreview
          invoice={{
            id: request.id.slice(0, 8),
            items: products.map((item) => ({
              ...item,
              subtotal: item.quantity * (item.unitPrice || 0),
            })),
            productsTotal,
            domesticShipping,
            internationalShipping,
            serviceFee,
            grandTotal,
          }}
        />

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