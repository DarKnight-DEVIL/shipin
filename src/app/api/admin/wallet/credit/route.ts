import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  FieldValue,
} from "firebase-admin/firestore";

import {
  adminDb,
} from "@/lib/firebaseAdmin";

import {
  requireAdmin,
  getAdminAuthError,
} from "@/lib/adminAuth";

export async function POST(
  request: NextRequest
) {
  try {
    /*
     * ========================================
     * ADMIN AUTHORIZATION
     * ========================================
     */

    const admin =
      await requireAdmin(request);

    /*
     * ========================================
     * READ REQUEST
     * ========================================
     */

    const body =
      await request.json();

    const customerId =
      typeof body.customerId === "string"
        ? body.customerId.trim()
        : "";

    const amount =
      Number(body.amount);

    const description =
      typeof body.description === "string" &&
      body.description.trim()
        ? body.description.trim()
        : "Credit issued by admin";

    const requestId =
      typeof body.requestId === "string" &&
      body.requestId.trim()
        ? body.requestId.trim()
        : null;

    const isRefund =
      body.type === "refund";

    /*
     * ========================================
     * VALIDATE CUSTOMER
     * ========================================
     */

    if (!customerId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Customer ID is required.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * ========================================
     * VALIDATE CREDIT AMOUNT
     * ========================================
     */

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Credit amount must be greater than zero.",
        },
        {
          status: 400,
        }
      );
    }

    const creditAmount =
      Number(amount.toFixed(2));

    if (creditAmount > 10000) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A maximum of 10,000 credits can be added at once.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * ========================================
     * REFUND VALIDATION
     * ========================================
     */

    if (isRefund && !requestId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Request ID is required for a refund.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * ========================================
     * REFERENCES
     * ========================================
     */

    const customerRef =
      adminDb
        .collection("users")
        .doc(customerId);

    const walletRef =
      adminDb
        .collection("wallets")
        .doc(customerId);

    const transactionRef =
      adminDb
        .collection(
          "walletTransactions"
        )
        .doc();

    /*
     * ========================================
     * REQUEST REFERENCE
     * ========================================
     */

    const requestRef =
      requestId
        ? adminDb
            .collection("requests")
            .doc(requestId)
        : null;

    /*
     * ========================================
     * ATOMIC WALLET CREDIT
     * ========================================
     */

    const result =
      await adminDb.runTransaction(
        async (transaction) => {

          /*
           * Firestore transactions require
           * all reads before writes.
           */

          const customerSnapshot =
            await transaction.get(
              customerRef
            );

          const walletSnapshot =
            await transaction.get(
              walletRef
            );

          /*
           * If this is a refund, read the
           * request inside the same transaction.
           */

          const requestSnapshot =
            requestRef
              ? await transaction.get(
                  requestRef
                )
              : null;

          /*
           * CUSTOMER
           */

          if (
            !customerSnapshot.exists
          ) {
            throw new Error(
              "CUSTOMER_NOT_FOUND"
            );
          }

          const customerData =
            customerSnapshot.data();

          /*
           * Never credit admin accounts.
           */

          if (
            customerData?.role ===
            "admin"
          ) {
            throw new Error(
              "CANNOT_CREDIT_ADMIN"
            );
          }

          /*
           * ====================================
           * REFUND REQUEST VALIDATION
           * ====================================
           */

          if (isRefund) {

            if (
              !requestSnapshot ||
              !requestSnapshot.exists
            ) {
              throw new Error(
                "REQUEST_NOT_FOUND"
              );
            }

            const requestData =
              requestSnapshot.data();

            /*
             * Make absolutely sure the
             * request belongs to this user.
             */

            if (
              requestData?.userId !==
              customerId
            ) {
              throw new Error(
                "REQUEST_CUSTOMER_MISMATCH"
              );
            }

            /*
             * Only an active refund request
             * can be processed.
             */

            if (
              requestData?.refundRequest
                ?.status !==
              "requested"
            ) {
              throw new Error(
                "REFUND_NOT_REQUESTED"
              );
            }

            /*
             * Prevent accidental double
             * wallet refunds.
             */

            if (
              requestData?.refundRequest
                ?.walletStatus ===
              "completed"
            ) {
              throw new Error(
                "WALLET_REFUND_ALREADY_COMPLETED"
              );
            }
          }

          /*
           * ====================================
           * CURRENT BALANCE
           * ====================================
           */

          const currentBalance =
            walletSnapshot.exists
              ? Number(
                  walletSnapshot.data()
                    ?.balance ?? 0
                )
              : 0;

          if (
            !Number.isFinite(
              currentBalance
            ) ||
            currentBalance < 0
          ) {
            throw new Error(
              "INVALID_WALLET_BALANCE"
            );
          }

          /*
           * ====================================
           * NEW BALANCE
           * ====================================
           */

          const newBalance =
            Number(
              (
                currentBalance +
                creditAmount
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
           * AUDIT TRANSACTION
           * ====================================
           */

          transaction.set(
            transactionRef,
            {
              userId:
                customerId,

              type:
                isRefund
                  ? "refund"
                  : "admin_credit",

              amount:
                creditAmount,

              balanceAfter:
                newBalance,

              description,

              requestId:
                requestId,

              createdAt:
                FieldValue.serverTimestamp(),

              createdBy:
                admin.uid,

              createdByEmail:
                admin.email || null,
            }
          );

          /*
           * ====================================
           * MARK REFUND PORTION COMPLETE
           * ====================================
           */

          if (
            isRefund &&
            requestRef
          ) {
            const requestData =
              requestSnapshot?.data();

            const refundRequest =
              requestData?.refundRequest;

            const walletAmount =
              Number(
                refundRequest?.walletAmount ??
                  refundRequest?.amount ??
                  0
              );

            const paypalAmount =
              Number(
                refundRequest?.paypalAmount ??
                  0
              );

            const paypalCompleted =
              refundRequest?.paypalRefundStatus ===
              "completed";

            /*
             * The wallet portion is being completed
             * by this transaction.
             */
            const walletCompleted = true;

            /*
             * Check whether every required refund
             * portion is now complete.
             */
            const walletDone =
              walletAmount <= 0 ||
              walletCompleted;

            const paypalDone =
              paypalAmount <= 0 ||
              paypalCompleted;

            const fullyRefunded =
              walletDone &&
              paypalDone;

            transaction.update(
              requestRef,
              {
                "refundRequest.walletStatus":
                  "completed",

                "refundRequest.walletAmount":
                  creditAmount,

                "refundRequest.walletCompletedAt":
                  FieldValue.serverTimestamp(),

                ...(fullyRefunded
                  ? {
                      "refundRequest.status":
                        "completed",

                      "refundRequest.processedAt":
                        FieldValue.serverTimestamp(),

                      status:
                        "refunded",

                      "statusHistory.refunded":
                        FieldValue.serverTimestamp(),
                    }
                  : {}),

                updatedAt:
                  FieldValue.serverTimestamp(),
              }
            );
          }

          return {
            previousBalance:
              currentBalance,

            creditAdded:
              creditAmount,

            newBalance,
          };
        }
      );

    /*
     * ========================================
     * SUCCESS
     * ========================================
     */

    return NextResponse.json({
      success: true,

      customerId,

      previousBalance:
        result.previousBalance,

      creditAdded:
        result.creditAdded,

      newBalance:
        result.newBalance,

      transactionId:
        transactionRef.id,

      type:
        isRefund
          ? "refund"
          : "admin_credit",
    });

  } catch (error) {

    /*
     * ========================================
     * AUTH ERRORS
     * ========================================
     */

    const authError =
      getAdminAuthError(error);

    if (
      authError.status !== 500 ||
      (
        error instanceof Error &&
        [
          "AUTHENTICATION_REQUIRED",
          "INVALID_AUTHENTICATION",
          "USER_PROFILE_NOT_FOUND",
          "ADMIN_ACCESS_REQUIRED",
        ].includes(
          error.message
        )
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            authError.error,
        },
        {
          status:
            authError.status,
        }
      );
    }

    /*
     * ========================================
     * CUSTOM ERRORS
     * ========================================
     */

    if (
      error instanceof Error
    ) {

      if (
        error.message ===
        "CUSTOMER_NOT_FOUND"
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Customer could not be found.",
          },
          {
            status: 404,
          }
        );
      }

      if (
        error.message ===
        "REQUEST_NOT_FOUND"
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Refund request could not be found.",
          },
          {
            status: 404,
          }
        );
      }

      if (
        error.message ===
        "REQUEST_CUSTOMER_MISMATCH"
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "This refund request does not belong to the selected customer.",
          },
          {
            status: 400,
          }
        );
      }

      if (
        error.message ===
        "REFUND_NOT_REQUESTED"
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "This request does not have an active refund request.",
          },
          {
            status: 400,
          }
        );
      }

      if (
        error.message ===
        "WALLET_REFUND_ALREADY_COMPLETED"
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "The wallet portion of this refund has already been completed.",
          },
          {
            status: 400,
          }
        );
      }

      if (
        error.message ===
        "CANNOT_CREDIT_ADMIN"
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Admin accounts cannot be credited through customer wallet management.",
          },
          {
            status: 400,
          }
        );
      }

      if (
        error.message ===
        "INVALID_WALLET_BALANCE"
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "The customer's wallet balance is invalid.",
          },
          {
            status: 500,
          }
        );
      }
    }

    /*
     * ========================================
     * UNKNOWN ERROR
     * ========================================
     */

    console.error(
      "Admin wallet credit error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Unable to add wallet credits.",
      },
      {
        status: 500,
      }
    );
  }
}