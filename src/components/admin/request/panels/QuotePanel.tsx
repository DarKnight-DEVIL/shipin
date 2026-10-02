"use client";

import { useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { toast } from "sonner";

import type { Request } from "@/types/request";
import Section from "@/components/ui/Section";
import ActionButton from "@/components/ui/ActionButton";
import InvoicePreview from "@/components/invoice/InvoicePreview";
import InvoicePDF from "@/components/invoice/InvoicePDF";

import {
  calculateServiceFeeFromConfig,
  calculateInspectionFee,
  calculateHoldFee,
  requiresManualQuote,
} from "@/lib/quoteCalculator";

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

  // Service selections
  const inspection =
    request.serviceSelections?.inspection ?? "standard";

  const shippingPreference =
    request.serviceSelections?.shippingPreference ?? "approval";

  const [domesticShipping, setDomesticShipping] = useState(
    existingQuote?.breakdown?.domesticShipping ?? 0
  );

  const [internationalShipping, setInternationalShipping] =
    useState(
      existingQuote?.breakdown?.internationalShipping ?? 0
    );

  const [saving, setSaving] = useState(false);

  /*
   * ========================================
   * PRODUCTS TOTAL
   * ========================================
   */

  const productsTotal = products.reduce(
    (sum: number, item) =>
      sum + item.quantity * (item.unitPrice || 0),
    0
  );

  /*
   * ========================================
   * SERVICE FEE
   * ========================================
   *
   * Product-based ShipIN service fee:
   *
   * <= $10       → $0
   * > $10–$30    → $5
   * > $30–$500   → 10%, minimum $10
   * > $500       → Manual quote
   *
   * Inspection and hold fees are NOT included
   * in this calculation.
   */

  const serviceFee = calculateServiceFeeFromConfig(
    request.serviceSelections,
    productsTotal
  );

  const manualQuoteRequired =
    requiresManualQuote(productsTotal);

  /*
   * ========================================
   * ADDITIONAL SERVICE FEES
   * ========================================
   */

  const inspectionFee =
    calculateInspectionFee(
      request.serviceSelections
    );

  const holdFee =
    calculateHoldFee(
      request.serviceSelections
    );

  /*
   * ========================================
   * GRAND TOTAL
   * ========================================
   */

  const grandTotal =
    Number(productsTotal) +
    Number(domesticShipping) +
    Number(internationalShipping) +
    Number(serviceFee) +
    Number(inspectionFee) +
    Number(holdFee);

  /*
   * ========================================
   * INVOICE DOWNLOAD
   * ========================================
   */

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

  /*
   * ========================================
   * SAVE QUOTE
   * ========================================
   */

  async function saveQuote() {
    if (manualQuoteRequired) {
      toast.error("Manual quote required.", {
        description:
          "Orders with products above $500 require a manual quote.",
      });

      return;
    }

    if (productsTotal < 0) {
      toast.error("Invalid products total.");
      return;
    }

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

          // Product-based ShipIN service fee
          serviceFee,

          // Additional fees kept separate
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

        regeneratedCount:
          (existingQuote?.regeneratedCount ?? 0) + 1,

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

            quoteRegenerationRequested:
              false,
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

      toast.success(
        request.quoteRegenerationRequested
          ? "New quotation generated successfully!"
          : "Quote saved successfully."
      );
    } catch (error) {
      console.error(error);

      toast.error(
        "Failed to save quote.",
        {
          description:
            error instanceof Error
              ? error.message
              : undefined,
        }
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

        {/* ========================================
            LEFT
            ======================================== */}

        <div className="space-y-6">

          {/* ========================================
              PRODUCT PRICES
              ======================================== */}

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

                <div className="flex items-center gap-6">

                  <div className="flex flex-col">
                    <label className="text-xs text-slate-500 mb-1">
                      Unit Price ($)
                    </label>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={
                        item.unitPrice || ""
                      }
                      onChange={(e) => {
                        const copy = [
                          ...products,
                        ];

                        copy[index].unitPrice =
                          Number(
                            e.target.value
                          );

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
                      $
                      {(
                        item.quantity *
                        (item.unitPrice || 0)
                      ).toFixed(2)}
                    </p>
                  </div>

                </div>
              </div>
            </div>
          ))}

          <hr className="border-slate-700" />

          {/* ========================================
              SHIPPING
              ======================================== */}

          <CostField
            label="Domestic Shipping"
            value={domesticShipping}
            setValue={setDomesticShipping}
          />

          <CostField
            label="International Shipping"
            value={internationalShipping}
            setValue={
              setInternationalShipping
            }
          />

          {/* ========================================
              BREAKDOWN
              ======================================== */}

          <div className="bg-slate-800 rounded-xl p-6 space-y-4">

            <SummaryRow
              label="Products Total"
              value={productsTotal}
            />

            {/* ========================================
                SHIPIN SERVICE FEE
                ======================================== */}

            <div className="flex justify-between text-slate-400 text-sm">
              <span>
                ShipIN Service Fee
              </span>

              <span>
                {manualQuoteRequired ? (
                  <span className="text-amber-400 font-medium">
                    Manual Quote
                  </span>
                ) : (
                  `$${serviceFee.toFixed(2)}`
                )}
              </span>
            </div>

            {/* Service Fee Explanation */}

            {!manualQuoteRequired &&
              productsTotal > 0 && (
                <div className="text-xs text-slate-500 -mt-2">
                  {productsTotal <= 10 && (
                    <>
                      No service fee for
                      orders up to $10.
                    </>
                  )}

                  {productsTotal > 10 &&
                    productsTotal <= 30 && (
                      <>
                        $5 service fee for
                        orders above $10
                        up to $30.
                      </>
                    )}

                  {productsTotal > 30 &&
                    productsTotal <= 500 && (
                      <>
                        10% service fee
                        with a $10 minimum.
                      </>
                    )}
                </div>
              )}

            {manualQuoteRequired && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="text-sm text-amber-400 font-medium">
                  Manual quote required
                </p>

                <p className="text-xs text-amber-400/80 mt-1">
                  Product totals above
                  $500 require a
                  manually reviewed quote.
                </p>
              </div>
            )}

            {/* ========================================
                INSPECTION
                ======================================== */}

            <div className="flex justify-between text-slate-400 text-sm">
              <span>
                Detailed Inspection
              </span>

              <span>
                $
                {inspectionFee.toFixed(2)}
              </span>
            </div>

            {/* ========================================
                HOLD PACKAGE
                ======================================== */}

            <div className="flex justify-between text-slate-400 text-sm">
              <span>
                Hold Package
              </span>

              <span>
                $
                {holdFee.toFixed(2)}
              </span>
            </div>

            {/* ========================================
                SHIPPING
                ======================================== */}

            <SummaryRow
              label="Domestic Shipping"
              value={domesticShipping}
            />

            <SummaryRow
              label="International Shipping"
              value={internationalShipping}
            />

            <hr className="border-slate-700" />

            {/* ========================================
                GRAND TOTAL
                ======================================== */}

            <div className="flex justify-between">
              <span className="text-xl font-bold text-white">
                Grand Total
              </span>

              <span className="text-2xl font-bold text-green-400">
                {manualQuoteRequired
                  ? "Manual Quote"
                  : `$${grandTotal.toFixed(2)}`}
              </span>
            </div>

          </div>

          {/* ========================================
              SAVE / DOWNLOAD
              ======================================== */}

          <div className="flex gap-3 mt-8">

            <ActionButton
              loading={saving}
              onClick={saveQuote}
              disabled={manualQuoteRequired}
              className="flex-1"
            >
              {manualQuoteRequired
                ? "Manual Quote Required"
                : request.quoteRegenerationRequested
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

        {/* ========================================
            RIGHT — INVOICE PREVIEW
            ======================================== */}

        <InvoicePreview invoice={invoice} />

      </div>
    </Section>
  );
}

/*
 * ========================================
 * COST FIELD
 * ========================================
 */

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
        min="0"
        step="0.01"
        value={value || ""}
        onChange={(e) =>
          setValue(
            Math.max(
              0,
              Number(e.target.value)
            )
          )
        }
        className="w-28 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white"
      />

    </div>
  );
}

/*
 * ========================================
 * SUMMARY ROW
 * ========================================
 */

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