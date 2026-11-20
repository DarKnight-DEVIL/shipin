/**
 * Settle an additional-item payment that PayPal has already captured.
 *
 * The add-on is paid by recording three things together: the item's own status,
 * the request's item list and payment history, and the PayPal payment order.
 * They are written one after the other exactly as before — the amount checks run
 * first, so a mismatch cannot leave a half-settled request behind.
 */

import {
  FieldValue,
  type DocumentData,
  type DocumentReference,
  type Timestamp,
} from "firebase-admin/firestore";

import type { AdditionalItemRequest } from "@/types/request";

import { roundMoney, sameCents, toNumber } from "./amounts";
import type { PaymentFailure } from "./types";

/**
 * The additional-item array while it is being written: `paidAt` holds a Date
 * here and a Timestamp on read, so the read type is too narrow for the write.
 */
type AdditionalItemWrite = Omit<AdditionalItemRequest, "paidAt"> & {
  paidAt?: Timestamp | FieldValue | Date;
};

export interface AdditionalItemSettlementInput {
  requestRef: DocumentReference;
  paymentOrderRef: DocumentReference;
  requestData: DocumentData;
  paymentOrder: DocumentData;
  additionalItemRequestId: string;
  orderID: string;
  captureId: string;
  capturedAmount: number;
  capturedCurrency: string;
}

export async function settleAdditionalItemPayment({
  requestRef,
  paymentOrderRef,
  requestData,
  paymentOrder,
  additionalItemRequestId,
  orderID,
  captureId,
  capturedAmount,
  capturedCurrency,
}: AdditionalItemSettlementInput): Promise<{ ok: true } | PaymentFailure> {
  const additionalItems = (requestData.additionalItemRequests ??
    []) as AdditionalItemWrite[];

  const additionalItem = additionalItems.find(
    (item) => item.id === additionalItemRequestId
  );

  if (!additionalItem) {
    return {
      ok: false,
      status: 404,
      error: "Additional item request could not be found.",
    };
  }

  if (additionalItem.status !== "awaiting_payment") {
    return {
      ok: false,
      status: 400,
      error: "This additional item is not awaiting payment.",
    };
  }

  const storedBaseAmount = roundMoney(toNumber(paymentOrder.baseAmount));
  const additionalItemTotal = roundMoney(toNumber(additionalItem.totalDue));

  if (!sameCents(storedBaseAmount, additionalItemTotal)) {
    console.error("Additional item base amount mismatch:", {
      storedBaseAmount,
      additionalItemTotal,
      orderID,
    });

    return {
      ok: false,
      status: 400,
      error: "The additional item payment amount could not be verified.",
    };
  }

  const paidAt = new Date();

  const paidItem: AdditionalItemWrite = {
    ...additionalItem,
    status: "paid",
    amountPaid: capturedAmount,
    paidAt,
  };

  await requestRef.update({
    additionalItemRequests: additionalItems.map((item) =>
      item.id === additionalItem.id ? paidItem : item
    ),

    items: FieldValue.arrayUnion({
      name: additionalItem.item?.name,
      url: additionalItem.item?.url || "",
      quantity: additionalItem.item?.quantity,
      unitPrice: additionalItem.unitPrice,
      subtotal: additionalItem.subtotal,
    }),

    additionalPayments: FieldValue.arrayUnion({
      id: captureId,
      additionalItemRequestId,
      provider: "paypal",
      paymentMethod: "paypal",
      orderId: orderID,
      captureId,
      amount: capturedAmount,
      currency: capturedCurrency,
      status: "completed",
      paidAt: paidAt.toISOString(),
    }),

    updatedAt: FieldValue.serverTimestamp(),
  });

  await paymentOrderRef.update({
    status: "completed",
    captureId,
    capturedAmount,
    capturedCurrency,
    completedAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
}
