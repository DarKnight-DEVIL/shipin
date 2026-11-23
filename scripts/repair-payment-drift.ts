/**
 * Repair command for payment drift.
 *
 * This script can replay main and add-on settlements from stored PayPal orders.
 * It supports a dry-run mode to preview repairs before applying them.
 *
 * Usage:
 *   npx tsx scripts/repair-payment-drift.ts --dry-run
 *   npx tsx scripts/repair-payment-drift.ts --apply
 *
 * The script:
 * 1. Scans all paypalPaymentOrders documents
 * 2. Validates the payment calculations (totalRequired = walletApplied + paypalAmount)
 * 3. For main payments: verifies and re-settles if drift detected
 * 4. For add-on payments: verifies and re-settles if drift detected
 * 5. Reports drift findings and actions taken
 */

import { adminDb } from "@/lib/firebaseAdmin";
import {
  settleMainPayment,
  settleAdditionalItemPayment,
} from "@/lib/paypal/settlement";
import { roundMoney, sameCents, toNumber } from "@/lib/paypal/amounts";
import type { DocumentData } from "firebase-admin/firestore";

interface PaymentOrderData {
  id: string;
  requestId: string;
  userId: string;
  paymentType: "main" | "additional_item";
  orderId?: string;
  baseAmount: number;
  totalRequired: number;
  walletApplied: number;
  paypalAmount: number;
  status: string;
  captureId?: string;
  additionalItemRequestId?: string;
  items?: any[];
  additionalPayments?: any[];
  createdAt?: any;
  updatedAt?: any;
  completedAt?: any;
}

/**
 * Fetch all paypalPaymentOrders documents
 */
async function fetchPaymentOrders(): Promise<PaymentOrderData[]> {
  const snapshot = await adminDb.collection("paypalPaymentOrders").get();
  const orders: PaymentOrderData[] = [];

  snapshot.forEach((doc) => {
    const data = doc.data() as PaymentOrderData;
    orders.push({
      id: doc.id,
      ...data,
    });
  });

  return orders;
}

/**
 * Validate a main payment order's calculations
 */
function validateMainPayment(order: PaymentOrderData): {
  valid: boolean;
  drift: number;
} {
  const calculatedTotal = roundMoney(
    toNumber(order.walletApplied) + toNumber(order.paypalAmount)
  );
  const storedTotal = roundMoney(toNumber(order.totalRequired));
  const drift = calculatedTotal - storedTotal;

  return {
    valid: sameCents(calculatedTotal, storedTotal),
    drift,
  };
}

/**
 * Validate an add-on payment order's calculations
 */
function validateAddonPayment(order: PaymentOrderData): {
  valid: boolean;
  drift: number;
} {
  // For add-on payments, validate that baseAmount and totalRequired are consistent
  // with the wallet + paypal split
  const calculatedTotal = roundMoney(
    toNumber(order.walletApplied) + toNumber(order.paypalAmount)
  );
  const storedTotal = roundMoney(toNumber(order.totalRequired));
  const drift = calculatedTotal - storedTotal;

  return {
    valid: sameCents(calculatedTotal, storedTotal),
    drift,
  };
}

/**
 * Replay settlement for a main payment
 */
async function replayMainPayment(
  order: PaymentOrderData,
  dryRun: boolean
): Promise<{ success: boolean; message: string }> {
  const requestRef = adminDb.collection("requests").doc(order.requestId);
  const paymentOrderRef = adminDb
    .collection("paypalPaymentOrders")
    .doc(order.id);

  // Read the latest request and payment order data
  const [requestSnapshot, paymentOrderSnapshot] = await Promise.all([
    requestRef.get(),
    paymentOrderRef.get(),
  ]);

  if (!requestSnapshot.exists) {
    return { success: false, message: `Request ${order.requestId} not found` };
  }

  if (!paymentOrderSnapshot.exists) {
    return { success: false, message: `Payment order ${order.id} not found` };
  }

  const requestData = requestSnapshot.data();
  const paymentOrderData = paymentOrderSnapshot.data();

  // Validate the calculation
  const { valid, drift } = validateMainPayment(paymentOrderData);

  if (valid) {
    return {
      success: true,
      message: `Main payment ${order.id} is valid (drift: $${drift})`,
    };
  }

  if (dryRun) {
    return {
      success: true,
      message: `DRY-RUN: Main payment ${order.id} has drift of $${drift}, would re-settle`,
    };
  }

  try {
    const result = await settleMainPayment(
      requestRef,
      paymentOrderRef,
      paymentOrderData,
      order.requestId,
      order.orderId || "",
      paymentOrderData.captureId || "",
      Number(paymentOrderData.capturedAmount || 0),
      paymentOrderData.capturedCurrency || "USD",
      Number(paymentOrderData.paypalAmount || 0)
    );

    if (result.ok) {
      return {
        success: true,
        message: `Main payment ${order.id} re-settled successfully (method: ${result.paymentMethod}, wallet: $${result.walletApplied}, total: $${result.totalRequired})`,
      };
    } else {
      return {
        success: false,
        message: `Main payment ${order.id} re-settlement failed: ${result.error}`,
      };
    }
  } catch (error: any) {
    return {
      success: false,
      message: `Main payment ${order.id} re-settlement error: ${error.message}`,
    };
  }
}

/**
 * Replay settlement for an add-on payment
 */
async function replayAddonPayment(
  order: PaymentOrderData,
  dryRun: boolean
): Promise<{ success: boolean; message: string }> {
  const requestRef = adminDb.collection("requests").doc(order.requestId);
  const paymentOrderRef = adminDb
    .collection("paypalPaymentOrders")
    .doc(order.id);

  // Read the latest request and payment order data
  const [requestSnapshot, paymentOrderSnapshot] = await Promise.all([
    requestRef.get(),
    paymentOrderRef.get(),
  ]);

  if (!requestSnapshot.exists) {
    return { success: false, message: `Request ${order.requestId} not found` };
  }

  if (!paymentOrderSnapshot.exists) {
    return { success: false, message: `Payment order ${order.id} not found` };
  }

  const requestData = requestSnapshot.data();
  const paymentOrderData = paymentOrderSnapshot.data();

  // Validate the calculation
  const { valid, drift } = validateAddonPayment(paymentOrderData);

  if (valid) {
    return {
      success: true,
      message: `Add-on payment ${order.id} is valid (drift: $${drift})`,
    };
  }

  if (dryRun) {
    return {
      success: true,
      message: `DRY-RUN: Add-on payment ${order.id} has drift of $${drift}, would re-settle`,
    };
  }

  try {
    // For add-on payments, we need the additionalItemRequestId
    const additionalItemRequestId = paymentOrderData.additionalItemRequestId;

    if (!additionalItemRequestId) {
      return {
        success: false,
        message: `Add-on payment ${order.id} missing additionalItemRequestId`,
      };
    }

    const result = await settleAdditionalItemPayment({
      requestRef,
      paymentOrderRef,
      requestData,
      paymentOrderData,
      additionalItemRequestId: additionalItemRequestId as string,
      orderID: order.orderId || "",
      captureId: paymentOrderData.captureId || "",
      capturedAmount: Number(paymentOrderData.capturedAmount || 0),
      capturedCurrency: paymentOrderData.capturedCurrency || "USD",
    });

    if (result.ok) {
      return {
        success: true,
        message: `Add-on payment ${order.id} re-settled successfully`,
      };
    } else {
      return {
        success: false,
        message: `Add-on payment ${order.id} re-settlement failed: ${result.error}`,
      };
    }
  } catch (error: any) {
    return {
      success: false,
      message: `Add-on payment ${order.id} re-settlement error: ${error.message}`,
    };
  }
}

/**
 * Main function to run the repair command
 */
async function main() {
  const dryRun =
    process.argv.includes("--dry-run") || process.argv.includes("-d");
  const apply = process.argv.includes("--apply") || process.argv.includes("-a");

  if (!apply && !dryRun) {
    console.error(
      "Usage: npx tsx scripts/repair-payment-drift.ts --dry-run | --apply"
    );
    process.exit(1);
  }

  console.log(`Payment drift repair ${dryRun ? "dry-run mode" : "apply mode"}`);

  // Fetch all payment orders
  const orders = await fetchPaymentOrders();
  console.log(`Found ${orders.length} payment orders`);

  let mainProcessed = 0;
  let addonProcessed = 0;
  let mainDriftFixed = 0;
  let addonDriftFixed = 0;
  let mainErrors = 0;
  let addonErrors = 0;

  for (const order of orders) {
    if (order.paymentType === "main") {
      mainProcessed++;
      const result = await replayMainPayment(order, dryRun);

      if (result.message.includes("drift")) {
        mainDriftFixed++;
      }

      if (
        result.message.includes("failed") ||
        result.message.includes("error")
      ) {
        mainErrors++;
      }

      console.log(`[MAIN] ${order.id}: ${result.message}`);
    } else if (order.paymentType === "additional_item") {
      addonProcessed++;
      const result = await replayAddonPayment(order, dryRun);

      if (result.message.includes("drift")) {
        addonDriftFixed++;
      }

      if (
        result.message.includes("failed") ||
        result.message.includes("error")
      ) {
        addonErrors++;
      }

      console.log(`[ADDON] ${order.id}: ${result.message}`);
    }
  }

  // Summary
  console.log("\n=== Summary ===");
  console.log(`Main payments processed: ${mainProcessed}`);
  console.log(`Main drift fixed: ${mainDriftFixed}`);
  console.log(`Main errors: ${mainErrors}`);
  console.log(`Add-on payments processed: ${addonProcessed}`);
  console.log(`Add-on drift fixed: ${addonDriftFixed}`);
  console.log(`Add-on errors: ${addonErrors}`);

  if (mainErrors > 0 || addonErrors > 0) {
    console.error(
      "\nSome repairs failed. Review the output above for details."
    );
    process.exit(1);
  }

  console.log("\nAll repairs completed successfully.");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
