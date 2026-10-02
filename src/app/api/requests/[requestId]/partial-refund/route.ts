import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export async function POST(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ requestId: string }>;
  }
) {
  try {
    const { requestId } = await params;

    if (!requestId) {
      return NextResponse.json(
        {
          success: false,
          error: "Request ID is required.",
        },
        { status: 400 }
      );
    }

    /*
     * ====================================
     * AUTHENTICATION
     * ====================================
     */

    const authorization =
      req.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentication required.",
        },
        { status: 401 }
      );
    }

    const idToken =
      authorization.substring(7);

    if (!idToken) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentication required.",
        },
        { status: 401 }
      );
    }

    let decodedToken;

    try {
      decodedToken =
        await adminAuth.verifyIdToken(idToken);
    } catch (error) {
      console.error(
        "Partial refund authentication failed:",
        error
      );

      return NextResponse.json(
        {
          success: false,
          error: "Invalid authentication.",
        },
        { status: 401 }
      );
    }

    const authenticatedUserId =
      decodedToken.uid;

    /*
     * ====================================
     * REQUEST
     * ====================================
     */

    const requestRef =
      adminDb
        .collection("requests")
        .doc(requestId);

    /*
     * ====================================
     * INPUT
     * ====================================
     */

    const body = await req.json();

    const preference =
      body.preference;

    if (
      preference !== "wallet" &&
      preference !== "original_payment"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid partial refund preference.",
        },
        { status: 400 }
      );
    }

    /*
     * ====================================
     * TRANSACTION
     * ====================================
     */

    const result =
      await adminDb.runTransaction(
        async (transaction) => {
          const requestSnapshot =
            await transaction.get(
              requestRef
            );

          if (!requestSnapshot.exists) {
            throw new Error(
              "REQUEST_NOT_FOUND"
            );
          }

          const request =
            requestSnapshot.data();

          /*
           * ====================================
           * OWNERSHIP
           * ====================================
           */

          if (
            request?.userId !==
            authenticatedUserId
          ) {
            throw new Error(
              "UNAUTHORIZED_REQUEST"
            );
          }

          /*
           * ====================================
           * PARTIAL REFUND OFFER
           * ====================================
           */

          const offer =
            request?.partialRefundOffer;

          if (!offer) {
            throw new Error(
              "NO_PARTIAL_REFUND_OFFER"
            );
          }

          if (
            offer.status !==
            "offered"
          ) {
            throw new Error(
              "PARTIAL_REFUND_OFFER_UNAVAILABLE"
            );
          }

          const amount =
            Number(
              offer.amount
            );

          if (
            !Number.isFinite(amount) ||
            amount <= 0
          ) {
            throw new Error(
              "INVALID_PARTIAL_REFUND_AMOUNT"
            );
          }

          const roundedAmount =
            Number(
              amount.toFixed(2)
            );

          /*
           * ====================================
           * ORIGINAL PAYMENT
           * ====================================
           *
           * No money is moved here.
           *
           * Admin will manually process the
           * payment refund and record it.
           */

          if (
            preference ===
            "original_payment"
          ) {
            transaction.update(
              requestRef,
              {
                "partialRefundOffer.status":
                  "accepted",

                "partialRefundOffer.selectedMethod":
                  "original_payment",

                "partialRefundOffer.selectedAt":
                  FieldValue.serverTimestamp(),

                updatedAt:
                  FieldValue.serverTimestamp(),
              }
            );

            return {
              amount:
                roundedAmount,

              preference:
                "original_payment",

              status:
                "accepted",
            };
          }

          /*
           * ====================================
           * WALLET REFUND
           * ====================================
           */

          const walletRef =
            adminDb
              .collection("wallets")
              .doc(
                authenticatedUserId
              );

          const walletTransactionRef =
            adminDb
              .collection(
                "walletTransactions"
              )
              .doc();

          const walletSnapshot =
            await transaction.get(
              walletRef
            );

          const currentBalance =
            walletSnapshot.exists
              ? Number(
                  walletSnapshot.data()
                    ?.balance ?? 0
                )
              : 0;

          const newBalance =
            Number(
              (
                currentBalance +
                roundedAmount
              ).toFixed(2)
            );

          /*
           * ====================================
           * PARTIAL REFUND HISTORY
           * ====================================
           */

          const existingPartialRefunds =
            Array.isArray(
              request?.partialRefunds
            )
              ? request.partialRefunds
              : [];

          const partialRefundId =
            adminDb
              .collection("requests")
              .doc()
              .id;

          const partialRefund = {
            id:
              partialRefundId,

            amount:
              roundedAmount,

            reason:
              offer.reason ?? "",

            method:
              "wallet",

            createdAt:
              Timestamp.now(),

            createdBy:
              authenticatedUserId,

            createdByEmail:
              decodedToken.email ||
              null,
          };

          const previousRefundedAmount =
            Number(
              request?.totalRefundedAmount ??
                0
            );

          const newTotalRefundedAmount =
            Number(
              (
                previousRefundedAmount +
                roundedAmount
              ).toFixed(2)
            );

          /*
           * ====================================
           * UPDATE WALLET
           * ====================================
           */

          transaction.set(
            walletRef,
            {
              balance:
                newBalance,

              currency:
                walletSnapshot.exists
                  ? walletSnapshot.data()
                      ?.currency ||
                    "USD"
                  : "USD",

              updatedAt:
                FieldValue.serverTimestamp(),
            },
            {
              merge: true,
            }
          );

          /*
           * ====================================
           * WALLET AUDIT TRANSACTION
           * ====================================
           */

          transaction.set(
            walletTransactionRef,
            {
              userId:
                authenticatedUserId,

              type:
                "refund",

              amount:
                roundedAmount,

              balanceAfter:
                newBalance,

              description:
                `Partial refund: ${
                  offer.reason ??
                  "Partial refund"
                }`,

              requestId,

              createdAt:
                Timestamp.now(),

              createdBy:
                authenticatedUserId,

              createdByEmail:
                decodedToken.email ||
                null,
            }
          );

          /*
           * ====================================
           * UPDATE REQUEST
           * ====================================
           */

          transaction.update(
            requestRef,
            {
              partialRefunds:
                [
                  ...existingPartialRefunds,
                  partialRefund,
                ],

              totalRefundedAmount:
                newTotalRefundedAmount,

              "partialRefundOffer.status":
                "completed",

              "partialRefundOffer.selectedMethod":
                "wallet",

              "partialRefundOffer.selectedAt":
                FieldValue.serverTimestamp(),

              "partialRefundOffer.completedAt":
                FieldValue.serverTimestamp(),

              "partialRefundOffer.walletTransactionId":
                walletTransactionRef.id,

              "statusHistory.partial_refund_completed":
                FieldValue.serverTimestamp(),

              updatedAt:
                FieldValue.serverTimestamp(),
            }
          );

          return {
            amount:
              roundedAmount,

            preference:
              "wallet",

            status:
              "completed",

            walletBalance:
              newBalance,
          };
        }
      );

    /*
     * ====================================
     * SUCCESS
     * ====================================
     */

    return NextResponse.json({
      success: true,

      requestId,

      amount:
        result.amount,

      preference:
        result.preference,

      status:
        result.status,

      ...(result.preference ===
        "wallet"
        ? {
            walletBalance:
              result.walletBalance,
          }
        : {}),
    });
  } catch (error) {
    console.error(
      "Partial refund selection error:",
      error
    );

    /*
     * ====================================
     * KNOWN ERRORS
     * ====================================
     */

    if (
      error instanceof Error
    ) {
      switch (error.message) {
        case "REQUEST_NOT_FOUND":
          return NextResponse.json(
            {
              success: false,
              error:
                "Request not found.",
            },
            { status: 404 }
          );

        case "UNAUTHORIZED_REQUEST":
          return NextResponse.json(
            {
              success: false,
              error:
                "You are not authorized to access this request.",
            },
            { status: 403 }
          );

        case "NO_PARTIAL_REFUND_OFFER":
          return NextResponse.json(
            {
              success: false,
              error:
                "No partial refund offer exists for this request.",
            },
            { status: 400 }
          );

        case "PARTIAL_REFUND_OFFER_UNAVAILABLE":
          return NextResponse.json(
            {
              success: false,
              error:
                "This partial refund offer is no longer available.",
            },
            { status: 400 }
          );

        case "INVALID_PARTIAL_REFUND_AMOUNT":
          return NextResponse.json(
            {
              success: false,
              error:
                "Invalid partial refund amount.",
            },
            { status: 400 }
          );
      }
    }

    return NextResponse.json(
      {
        success: false,
        error:
          "Unable to process partial refund selection.",
      },
      { status: 500 }
    );
  }
}