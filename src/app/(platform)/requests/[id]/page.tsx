"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  doc,
  updateDoc,
  onSnapshot,
} from "firebase/firestore";
import {
  AlertCircle,
  ArrowLeft,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";

import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

import SupportCenter from "@/components/support/SupportCenter";
import { canCreateSupportTicket } from "@/lib/support";

import RequestHeader from "@/components/request/RequestHeader";
import RequestTimeline from "@/components/request/RequestTimeline";
import ProductsCard from "@/components/request/ProductsCard";
import QuoteCard from "@/components/request/QuoteCard";
import RequestPaymentStatus from "@/components/request/RequestPaymentStatus";
import AddItemRequest from "@/components/request/AddItemRequest";
import AdditionalItemPaymentsCard from "@/components/request/AdditionalItemPaymentsCard";
import PageSkeleton from "@/components/ui/PageSkeleton";
import QuoteCountdown from "@/components/request/QuoteCountdown";

import { isQuoteExpired } from "@/lib/quoteExpiry";
import type { Request } from "@/types/request";

export default function RequestDetailsPage() {
  const params = useParams();
  const router = useRouter();

  const requestId = params.id as string;

  const [request, setRequest] =
    useState<Request | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [approving, setApproving] =
    useState(false);

  const [inspectionUrls, setInspectionUrls] =
    useState<string[]>([]);

  const [lightboxOpen, setLightboxOpen] =
    useState(false);

  const [selectedPhoto, setSelectedPhoto] =
    useState(0);

  /*
   * ========================================
   * LIVE REQUEST LISTENER
   * ========================================
   */

  useEffect(() => {
    if (!requestId) return;

    let unsubscribeSnapshot:
      | (() => void)
      | undefined;

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      (user) => {
        if (!user) {
          setRequest(null);
          setLoading(false);

          if (unsubscribeSnapshot) {
            unsubscribeSnapshot();
          }

          return;
        }

        const requestRef = doc(
          db,
          "requests",
          requestId
        );

        unsubscribeSnapshot = onSnapshot(
          requestRef,
          (snapshot) => {
            if (snapshot.exists()) {
              setRequest({
                id: snapshot.id,
                ...snapshot.data(),
              } as Request);
            } else {
              setRequest(null);
            }

            setLoading(false);
          },
          (error) => {
            console.error(
              "Request snapshot error:",
              error
            );

            setLoading(false);
          }
        );
      }
    );

    return () => {
      unsubscribeAuth();

      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }
    };
  }, [requestId]);

  /*
   * ========================================
   * INSPECTION PHOTOS
   * ========================================
   */

  useEffect(() => {
    async function loadInspectionPhotos() {
      if (
        !request?.warehouse?.inspectionPhotos
          ?.length
      ) {
        setInspectionUrls([]);
        return;
      }

      try {
        const currentUser =
          auth.currentUser;

        if (!currentUser) {
          return;
        }

        const token =
          await currentUser.getIdToken();

        const urls = await Promise.all(
          request.warehouse.inspectionPhotos.map(
            async (key) => {
              const res = await fetch(
                "/api/r2/view",
                {
                  method: "POST",
                  headers: {
                    "Content-Type":
                      "application/json",

                    Authorization:
                      `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    key,
                  }),
                }
              );

              const data =
                await res.json();

              if (!res.ok) {
                console.error(data);
                return "";
              }

              return data.url;
            }
          )
        );

        setInspectionUrls(
          urls.filter(Boolean)
        );
      } catch (error) {
        console.error(
          "Failed to load inspection photos:",
          error
        );
      }
    }

    loadInspectionPhotos();
  }, [request]);

  /*
   * ========================================
   * MAIN QUOTE APPROVAL
   * ========================================
   */

  const handleApproveQuote =
    async () => {
      if (!requestId) return;

      setApproving(true);

      try {
        const requestRef = doc(
          db,
          "requests",
          requestId
        );

        await updateDoc(
          requestRef,
          {
            status:
              "awaiting_payment",
          }
        );

        router.push(
          `/payment/${requestId}`
        );
      } catch (error) {
        console.error(error);

        toast.error(
          "Unable to approve quote.",
          {
            description:
              error instanceof Error
                ? error.message
                : undefined,
          }
        );
      } finally {
        setApproving(false);
      }
    };

  /*
   * ========================================
   * LOADING
   * ========================================
   */

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-8 p-8">
        <PageSkeleton />
      </div>
    );
  }

  /*
   * ========================================
   * REQUEST NOT FOUND
   * ========================================
   */

  if (!request) {
    return (
      <div className="p-8 text-slate-700 dark:text-slate-300">
        Request not found.
      </div>
    );
  }

  /*
   * ========================================
   * REJECTED REQUEST
   * ========================================
   */

  if (request.status === "rejected") {
    return (
      <div className="mx-auto max-w-5xl space-y-8 p-8">

        {/* REQUEST HEADER */}

        <RequestHeader
          request={request}
        />

        {/* REJECTION CARD */}

        <section
          className="
            rounded-2xl
            border border-red-200
            bg-white
            p-6
            shadow-sm
            dark:border-red-500/20
            dark:bg-slate-900
            dark:shadow-none
          "
        >
          <div className="flex items-start gap-4">

            <div
              className="
                flex
                h-12
                w-12
                shrink-0
                items-center
                justify-center
                rounded-full
                border border-red-500/30
                bg-red-500/10
              "
            >
              <AlertCircle
                size={24}
                className="text-red-400"
              />
            </div>

            <div className="min-w-0">

              <div className="flex flex-wrap items-center gap-3">

                <h1 className="text-2xl font-bold text-slate-950 dark:text-white">
                  Request Rejected
                </h1>

                <span
                  className="
                    rounded-full
                    border border-red-500/30
                    bg-red-500/10
                    px-3
                    py-1
                    text-xs
                    font-semibold
                    text-red-400
                  "
                >
                  Rejected
                </span>

              </div>

              <p className="mt-2 text-slate-600 dark:text-slate-400">
                Unfortunately, we were unable to
                process this purchase request.
              </p>

            </div>

          </div>

          {/* REASON */}

          <div
            className="
              mt-6
              rounded-xl
              border border-red-200
              bg-red-50
              p-5
              dark:border-red-500/20
              dark:bg-slate-950
            "
          >
            <p
              className="
                text-xs
                font-semibold
                uppercase
                tracking-wide
                text-red-400
              "
            >
              Reason for Rejection
            </p>

            <p className="mt-2 whitespace-pre-wrap text-base leading-7 text-slate-700 dark:text-slate-200">
              {request.rejectionReason ||
                "No rejection reason was provided."}
            </p>
          </div>

        </section>

        {/* TIMELINE */}

        <RequestTimeline
          status={request.status}
          history={request.statusHistory}
          orderChange={request.orderChange}
          refundRequest={request.refundRequest}
          partialRefunds={request.partialRefunds}
        />

        {/* PRODUCTS */}

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
              Requested Products
            </h2>

            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Products included in this request.
            </p>
          </div>

          <ProductsCard
            request={request}
          />
        </section>

        {/* SUPPORT */}

        <SupportCenter
          requestId={request.id}
          customerId={request.userId}
          canCreateTicket={canCreateSupportTicket(
            request
          )}
        />

        {/* NEXT ACTION */}

        <section
          className="
            rounded-2xl
            border border-slate-200
            bg-white
            p-6
            shadow-sm
            dark:border-slate-800
            dark:bg-slate-900
            dark:shadow-none
          "
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">

            <div>

              <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
                Want to try again?
              </h2>

              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Create a new purchase request with
                different products or updated details.
              </p>

            </div>

            <Link
              href="/requests/new"
              className="
                inline-flex
                shrink-0
                items-center
                justify-center
                gap-2
                rounded-xl
                bg-purple-600
                px-5
                py-3
                font-semibold
                text-white
                transition
                hover:bg-purple-700
              "
            >
              <RotateCcw
                size={18}
              />

              Create New Request
            </Link>

          </div>
        </section>

        {/* BACK */}

        <div>
          <Link
            href="/requests"
            className="
              inline-flex
              items-center
              gap-2
              text-sm
              font-medium
              text-slate-400
              transition
              hover:text-white
            "
          >
            <ArrowLeft
              size={16}
            />

            Back to My Requests
          </Link>
        </div>

      </div>
    );
  }

  /*
   * ========================================
   * NORMAL REQUEST
   * ========================================
   */

  const quoteExpired =
    isQuoteExpired(
      request.quote?.expiresAt
    );

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-8">

      {/* REQUEST HEADER */}

      <RequestHeader
        request={request}
      />

      {/* REFUND OFFER NOTIFICATION */}

      {request.status === "refund_offered" &&
        request.refundOffer?.offered === true &&
        !request.refundRequest && (
          <section
            className="
              rounded-2xl
              border border-red-500/20
              bg-red-500/5
              p-6
              shadow-sm
              dark:bg-red-500/[0.04]
            "
          >
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
                    !
                  </div>

                  <div>
                    <h2 className="text-xl font-bold text-slate-950 dark:text-white">
                      Refund Offered
                    </h2>

                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      Our team has offered you a refund for this order.
                      Please review the offer and select your preferred
                      refund method.
                    </p>
                  </div>
                </div>

                {request.refundOffer?.reason && (
                  <div className="mt-4 rounded-xl border border-red-500/10 bg-white p-4 dark:bg-slate-900">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Reason
                    </p>

                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                      {request.refundOffer.reason}
                    </p>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  document
                    .getElementById("refund-offer")
                    ?.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    });
                }}
                className="
                  inline-flex
                  shrink-0
                  items-center
                  justify-center
                  rounded-xl
                  bg-red-600
                  px-5
                  py-3
                  font-semibold
                  text-white
                  transition
                  hover:bg-red-700
                "
              >
                Review Refund Offer
              </button>
            </div>
          </section>
        )}

      {/* REQUEST TIMELINE */}

      <RequestTimeline
        status={request.status}
        history={request.statusHistory}
        orderChange={request.orderChange}
        refundRequest={request.refundRequest}
        partialRefunds={request.partialRefunds}
      />

      {/* SHIPMENT TRACKING */}

      <section className="space-y-4">

        <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
          Shipment
        </h2>

        {request.tracking
          ?.internalTrackingId ? (

          <div
            className="
              rounded-xl
              border
              border-slate-200
              bg-white
              p-4
              shadow-sm
              dark:border-slate-800
              dark:bg-slate-900
              dark:shadow-none
            "
          >
            <p className="text-sm text-slate-400">
              ShipIN Tracking ID
            </p>

            <p className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
              {
                request.tracking
                  .internalTrackingId
              }
            </p>

            <p className="mt-2 text-xs text-slate-500">
              Use this tracking ID to track your shipment on ShipIN.
            </p>
          </div>

        ) : (

          <p className="text-sm text-slate-500 dark:text-slate-400">
            Your shipment has not been dispatched yet.
          </p>

        )}

      </section>

      {/* ORIGINAL PRODUCTS */}

      <ProductsCard
        request={request}
      />

      {/* ADD ITEM REQUEST */}

      <AddItemRequest
        request={request}
      />

      {/* ADDITIONAL ITEM PAYMENTS */}

      <AdditionalItemPaymentsCard
        requestId={request.id}
        additionalItemRequests={
          request.additionalItemRequests ||
          []
        }
      />

      {/* MAIN QUOTE */}

      <QuoteCard
        request={request}
      />

      {/* QUOTE COUNTDOWN */}

      {request.quote?.expiresAt &&
        request.status === "review" && (
          <QuoteCountdown
            expiresAt={
              request.quote.expiresAt
            }
          />
        )}

      {/* MAIN PAYMENT ACTIONS */}

      <RequestPaymentStatus
        request={request}
        onApproveQuote={
          handleApproveQuote
        }
        approving={approving}
      />

      {/* QUOTE EXPIRED BANNER */}

      {quoteExpired &&
        (
          request.status ===
            "review" ||
          request.status ===
            "awaiting_payment"
        ) && (

          <div
            className="
              mt-6
              rounded-xl
              border
              border-red-500/20
              bg-red-500/10
              p-5
            "
          >
            <h2 className="font-semibold text-red-400">
              Quote Expired
            </h2>

            <p className="mt-2 text-slate-400">
              This quote has expired and can no longer be used for payment.
              Please request a new quote.
            </p>
          </div>

        )}

      {/* INSPECTION PHOTOS */}

      {inspectionUrls.length > 0 && (

        <div
          className="
            rounded-2xl
            border
            border-slate-200
            bg-white
            p-6
            shadow-sm
            dark:border-slate-800
            dark:bg-slate-900
            dark:shadow-none
          "
        >

          <h2 className="mb-5 text-xl font-semibold text-slate-950 dark:text-white">
            Inspection Photos
          </h2>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">

            {inspectionUrls.map(
              (photo, index) => (

                <img
                  key={photo}
                  src={photo}
                  alt="Inspection"
                  onClick={() => {
                    setSelectedPhoto(
                      index
                    );

                    setLightboxOpen(
                      true
                    );
                  }}
                  className="
                    aspect-video
                    cursor-zoom-in
                    rounded-xl
                    border
                    border-slate-700
                    object-cover
                    transition
                    hover:scale-[1.02]
                  "
                />

              )
            )}

          </div>

          <Lightbox
            open={lightboxOpen}
            close={() =>
              setLightboxOpen(false)
            }
            slides={inspectionUrls.map(
              (url) => ({
                src: url,
              })
            )}
            index={selectedPhoto}
          />

        </div>

      )}

      {/* SUPPORT */}

      <SupportCenter
        requestId={request.id}
        customerId={request.userId}
        canCreateTicket={canCreateSupportTicket(
          request
        )}
      />

    </div>
  );
}