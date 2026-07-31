import type { Request } from "@/types/request";

export interface InvoiceLineItem {
  id: string;
  type: "original" | "additional";

  name: string;
  quantity: number;

  unitPrice: number;
  subtotal: number;
}

export interface InvoiceAdditionalPurchase {
  id: string;

  name: string;
  quantity: number;

  unitPrice: number;
  subtotal: number;

  serviceFee: number;
  repackingFee: number;
  storageFee: number;

  totalPaid: number;
}

export interface InvoiceSummary {
  id: string;
  requestId: string;

  customerName: string;
  email: string;

  items: InvoiceLineItem[];

  originalItems: InvoiceLineItem[];
  additionalItems: InvoiceLineItem[];

  additionalPurchases: InvoiceAdditionalPurchase[];

  productsTotal: number;

  domesticShipping: number;
  internationalShipping: number;
  serviceFee: number;

  originalTotal: number;
  additionalTotal: number;

  grandTotal: number;
  totalPaid: number;
}

export function buildInvoiceSummary(
  request: Request
): InvoiceSummary {
  /*
   * =========================================
   * ORIGINAL PRODUCTS
   * =========================================
   */

  const originalItems: InvoiceLineItem[] =
    (request.quote?.items || []).map(
      (quoteItem, index) => {
        const requestItem =
          request.items?.[index];

        return {
          id: `original-${index}`,

          type: "original",

          name:
            quoteItem.name ??
            requestItem?.name ??
            "Product",

          quantity:
            quoteItem.quantity ??
            requestItem?.quantity ??
            1,

          unitPrice:
            quoteItem.unitPrice ?? 0,

          subtotal:
            quoteItem.subtotal ?? 0,
        };
      }
    );


  /*
   * =========================================
   * PAID ADDITIONAL PRODUCTS
   * =========================================
   *
   * Only include items that have actually
   * been paid for.
   */

  const paidAdditionalRequests =
    (
      request.additionalItemRequests ||
      []
    ).filter(
      (item) =>
        item.status === "paid" ||
        item.status === "purchased" ||
        item.status ===
          "warehouse_received" ||
        item.status === "packed"
    );


  const additionalItems: InvoiceLineItem[] =
    paidAdditionalRequests.map(
      (additionalItem) => {
        const quote =
          additionalItem.quote;

        return {
          id:
            additionalItem.id,

          type: "additional",

          name:
            additionalItem
              .item.name,

          quantity:
            additionalItem
              .item.quantity,

          unitPrice:
            quote?.unitPrice ??
            additionalItem
              .unitPrice ??
            0,

          subtotal:
            quote?.subtotal ??
            additionalItem
              .subtotal ??
            0,
        };
      }
    );


  /*
   * =========================================
   * ADDITIONAL PURCHASE BREAKDOWN
   * =========================================
   */

  const additionalPurchases:
    InvoiceAdditionalPurchase[] =
    paidAdditionalRequests.map(
      (additionalItem) => {
        const quote =
          additionalItem.quote;

        return {
          id:
            additionalItem.id,

          name:
            additionalItem
              .item.name,

          quantity:
            additionalItem
              .item.quantity,

          unitPrice:
            quote?.unitPrice ??
            additionalItem
              .unitPrice ??
            0,

          subtotal:
            quote?.subtotal ??
            additionalItem
              .subtotal ??
            0,

          serviceFee:
            quote?.serviceFee ??
            additionalItem
              .serviceFee ??
            0,

          repackingFee:
            quote?.repackingFee ??
            additionalItem
              .repackingFee ??
            0,

          storageFee:
            quote?.storageFee ??
            additionalItem
              .storageFee ??
            0,

          totalPaid:
            additionalItem
              .amountPaid ??
            quote?.totalDue ??
            additionalItem
              .totalDue ??
            0,
        };
      }
    );


  /*
   * =========================================
   * ORIGINAL QUOTE BREAKDOWN
   * =========================================
   */

  const breakdown =
    request.quote?.breakdown;

  const productsTotal =
    breakdown?.productsTotal ??
    originalItems.reduce(
      (sum, item) =>
        sum +
        item.subtotal,
      0
    );

  const domesticShipping =
    breakdown
      ?.domesticShipping ??
    0;

  const internationalShipping =
    breakdown
      ?.internationalShipping ??
    0;

  const serviceFee =
    breakdown?.serviceFee ??
    0;


  /*
   * =========================================
   * PAYMENT TOTALS
   * =========================================
   */

  const originalTotal =
    request.payment?.amount ??
    breakdown?.grandTotal ??
    0;


  const additionalTotal =
    additionalPurchases.reduce(
      (sum, purchase) =>
        sum +
        purchase.totalPaid,
      0
    );


  const totalPaid =
    originalTotal +
    additionalTotal;


  /*
   * =========================================
   * FINAL INVOICE
   * =========================================
   */

  return {
    id:
      request.id
        .slice(0, 8)
        .toUpperCase(),

    requestId:
      request.id,

    /*
     * Your Request interface currently
     * definitely contains email.
     *
     * If customerName exists in your
     * runtime Firestore document we use it.
     */
    customerName:
      (
        request as Request & {
          customerName?: string;
        }
      ).customerName ??
      request.shippingAddress
        ?.recipientName ??
      "Customer",

    /*
     * IMPORTANT:
     * Fixes the admin invoice showing
     * "No email provided".
     */
    email:
      request.email ||
      "No email provided",

    originalItems,

    additionalItems,

    /*
     * Combined list used by invoice tables.
     */
    items: [
      ...originalItems,
      ...additionalItems,
    ],

    additionalPurchases,

    productsTotal,

    domesticShipping,

    internationalShipping,

    serviceFee,

    originalTotal,

    additionalTotal,

    /*
     * This represents everything the
     * customer has paid across the
     * original + supplementary payments.
     */
    grandTotal:
      totalPaid,

    totalPaid,
  };
}