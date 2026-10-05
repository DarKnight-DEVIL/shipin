"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, updateDoc, onSnapshot } from "firebase/firestore";
import { AlertCircle, RotateCcw, ArrowLeft } from "lucide-react";
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

  const [request, setRequest] = useState<Request | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [inspectionUrls, setInspectionUrls] = useState<string[]>([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(0);

  useEffect(() => {
    if (!requestId) return;

    let unsubscribeSnapshot: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setRequest(null);
        setLoading(false);
        if (unsubscribeSnapshot) unsubscribeSnapshot();
        return;
      }

      const requestRef = doc(db, "requests", requestId);

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
          console.error("Request snapshot error:", error);
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, [requestId]);

  useEffect(() => {
    async function loadInspectionPhotos() {
      if (!request?.warehouse?.inspectionPhotos?.length) {
        setInspectionUrls([]);
        return;
      }

      try {
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        const token = await currentUser.getIdToken();

        const urls = await Promise.all(
          request.warehouse.inspectionPhotos.map(async (key) => {
            const res = await fetch("/api/r2/view", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ key }),
            });

            const data = await res.json();
            if (!res.ok) {
              console.error(data);
              return "";
            }
            return data.url;
          })
        );

        setInspectionUrls(urls.filter(Boolean));
      } catch (error) {
        console.error("Failed to load inspection photos:", error);
      }
    }

    loadInspectionPhotos();
  }, [request]);

  const handleApproveQuote = async () => {
    if (!requestId || !request) return;

    if (isQuoteExpired(request.quote?.expiresAt)) {
      toast.error("This quote has expired.", {
        description: "Request a new quote to continue.",
      });
      return;
    }
    
    setApproving(true);

    try {
      const requestRef = doc(db, "requests", requestId);
      await updateDoc(requestRef, {
        status: "awaiting_payment",
      });
      router.push(`/payment/${requestId}`);
    } catch (error) {
      console.error(error);
      toast.error("Unable to approve quote.", {
        description:
          error instanceof Error ? error.message : undefined,
      });
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <PageSkeleton />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <p className="text-slate-500">Request not found.</p>
        <Link
          href="/requests"
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-purple-400 hover:text-purple-300"
        >
          <ArrowLeft size={14} />
          Back to My Requests
        </Link>
      </div>
    );
  }

  /* ─── Rejected ─── */
  if (request.status === "rejected") {
    return (
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
        <RequestHeader request={request} />

        <section className="shipin-surface p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10">
              <AlertCircle size={22} className="text-red-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
                Request rejected
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                We were unable to process this purchase request.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-red-500/15 bg-red-500/5 p-4">
            <p className="shipin-section-label text-red-400/80">
              Reason
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200">
              {request.rejectionReason ||
                "No rejection reason was provided."}
            </p>
          </div>
        </section>

        <RequestTimeline
          status={request.status}
          history={request.statusHistory}
          orderChange={request.orderChange}
          refundRequest={request.refundRequest}
          partialRefunds={request.partialRefunds}
        />

        <ProductsCard request={request} />

        <SupportCenter
          requestId={request.id}
          customerId={request.userId}
          canCreateTicket={canCreateSupportTicket(request)}
        />

        <section className="shipin-surface flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">
              Want to try again?
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Create a new request with different products.
            </p>
          </div>
          <Link
            href="/requests/new"
            className="shipin-btn-primary inline-flex shrink-0 items-center justify-center gap-2 px-5 py-2.5 text-sm"
          >
            <RotateCcw size={16} />
            Create new request
          </Link>
        </section>
      </div>
    );
  }

  /* ─── Normal request ─── */
  const quoteExpired = isQuoteExpired(request.quote?.expiresAt);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <RequestHeader request={request} />

      {/* Refund offer banner */}
      {request.status === "refund_offered" &&
        request.refundOffer?.offered === true &&
        !request.refundRequest && (
          <section className="mt-6 shipin-surface border-red-500/20 bg-red-500/5 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-950 dark:text-white">
                  Refund offered
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Review the offer and choose your preferred refund method.
                </p>
                {request.refundOffer?.reason && (
                  <p className="mt-3 rounded-lg border border-red-500/10 bg-white/50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-950/40 dark:text-slate-300">
                    {request.refundOffer.reason}
                  </p>
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
                className="shrink-0 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Review offer
              </button>
            </div>
          </section>
        )}

      <div className="mt-8">
        <RequestTimeline
          status={request.status}
          history={request.statusHistory}
          orderChange={request.orderChange}
          refundRequest={request.refundRequest}
          partialRefunds={request.partialRefunds}
        />
      </div>

      {/* Main + sticky sidebar */}
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="space-y-6">
          {/* Shipment */}
          <section className="shipin-surface p-5">
            <p className="shipin-section-label mb-3">Shipment</p>
            {request.tracking?.internalTrackingId ? (
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-500">ShipIN tracking ID</p>
                  <p className="mt-0.5 font-mono text-lg font-medium tracking-wide text-slate-950 dark:text-white">
                    {request.tracking.internalTrackingId}
                  </p>
                </div>
                <Link
                  href={`/shipment/${request.id}`}
                  className="text-sm font-medium text-purple-400 hover:text-purple-300"
                >
                  Track →
                </Link>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Not dispatched yet.
              </p>
            )}
          </section>

          <ProductsCard request={request} />

          <AddItemRequest request={request} />

          <AdditionalItemPaymentsCard
            requestId={request.id}
            additionalItemRequests={
              request.additionalItemRequests || []
            }
          />

          {inspectionUrls.length > 0 && (
            <section className="shipin-surface p-5 sm:p-6">
              <h2 className="mb-4 text-base font-semibold text-slate-950 dark:text-white">
                Inspection photos
              </h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {inspectionUrls.map((photo, index) => (
                  <button
                    key={photo}
                    type="button"
                    onClick={() => {
                      setSelectedPhoto(index);
                      setLightboxOpen(true);
                    }}
                    className="group overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50"
                  >
                    <img
                      src={photo}
                      alt={`Inspection ${index + 1}`}
                      className="aspect-video w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                    />
                  </button>
                ))}
              </div>
              <Lightbox
                open={lightboxOpen}
                close={() => setLightboxOpen(false)}
                slides={inspectionUrls.map((url) => ({ src: url }))}
                index={selectedPhoto}
              />
            </section>
          )}

          <SupportCenter
            requestId={request.id}
            customerId={request.userId}
            canCreateTicket={canCreateSupportTicket(request)}
          />
        </div>

        {/* Sticky actions column */}
        <aside className="space-y-4 lg:sticky lg:top-6">
          {/* Note: Remember to add `compact?: boolean` to the Props interface in your QuoteCard.tsx! */}
          <QuoteCard request={request} compact />
          
          {/* Countdown only while the quote is still valid */}
          {request.quote?.expiresAt &&
            !quoteExpired &&
            (request.status === "review" ||
              request.status === "awaiting_payment") &&
            !request.payment && (
              <QuoteCountdown expiresAt={request.quote.expiresAt} />
            )}

          <RequestPaymentStatus
            request={request}
            onApproveQuote={handleApproveQuote}
            approving={approving}
          />
        </aside>
      </div>
    </div>
  );
}