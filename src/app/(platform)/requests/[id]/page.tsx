"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, updateDoc, onSnapshot } from "firebase/firestore";
import { AlertCircle, RotateCcw } from "lucide-react";
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
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <div className="app-page">
        <PageSkeleton />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="app-page">
        <div className="app-panel px-6 py-14 text-center">
          <h1 className="text-[15px] font-semibold text-[var(--foreground)]">
            Request not found
          </h1>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            It may have been removed, or the link is incorrect.
          </p>
          <Link href="/requests" className="app-btn app-btn-secondary mt-5">
            Back to requests
          </Link>
        </div>
      </div>
    );
  }

  /* ─── Rejected ─── */
  if (request.status === "rejected") {
    return (
      <div className="app-page">
        <RequestHeader request={request} />

        <section className="app-panel p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <AlertCircle size={16} />
            </div>

            <div className="min-w-0">
              <h2 className="text-[14px] font-semibold text-[var(--foreground)]">
                Request rejected
              </h2>
              <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                We were unable to process this purchase request.
              </p>
            </div>
          </div>

          <div className="app-notice-danger mt-4 rounded-lg p-3.5">
            <p className="app-kicker text-rose-700 dark:text-rose-400">
              Reason
            </p>
            <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-6 text-[var(--foreground)]">
              {request.rejectionReason ||
                "No rejection reason was provided."}
            </p>
          </div>
        </section>

        <div className="mt-5">
          <RequestTimeline
            status={request.status}
            history={request.statusHistory}
            orderChange={request.orderChange}
            refundRequest={request.refundRequest}
            partialRefunds={request.partialRefunds}
          />
        </div>

        <div className="mt-5">
          <ProductsCard request={request} />
        </div>

        <div className="mt-5">
          <SupportCenter
            requestId={request.id}
            customerId={request.userId}
            canCreateTicket={canCreateSupportTicket(request)}
          />
        </div>

        <section className="app-panel mt-5 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[13px] font-semibold text-[var(--foreground)]">
              Want to try again?
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--muted)]">
              Create a new request with different products.
            </p>
          </div>

          <Link
            href="/requests/new"
            className="app-btn app-btn-secondary shrink-0 self-start sm:self-center"
          >
            <RotateCcw size={14} />
            Create new request
          </Link>
        </section>
      </div>
    );
  }

  /* ─── Normal request ─── */
  const quoteExpired = isQuoteExpired(request.quote?.expiresAt);

  return (
    <div className="app-page">
      <RequestHeader request={request} />

      {/* Refund offer banner */}
      {request.status === "refund_offered" &&
        request.refundOffer?.offered === true &&
        !request.refundRequest && (
          <section className="app-panel app-notice-danger mt-5 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-[13px] font-semibold text-[var(--foreground)]">
                  Refund offered
                </h2>
                <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                  Review the offer and choose your preferred refund method.
                </p>
                {request.refundOffer?.reason && (
                  <p className="mt-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[12px] leading-5 text-[var(--muted)]">
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
                className="app-btn app-btn-danger shrink-0 self-start sm:self-center"
              >
                Review offer
              </button>
            </div>
          </section>
        )}

      <div className="mt-5">
        <RequestTimeline
          status={request.status}
          history={request.statusHistory}
          orderChange={request.orderChange}
          refundRequest={request.refundRequest}
          partialRefunds={request.partialRefunds}
        />
      </div>

      {/* Main + sticky sidebar */}
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="space-y-5">
          {/* Shipment */}
          <section className="app-panel p-5">
            <p className="app-kicker mb-2.5">Shipment</p>

            {request.tracking?.internalTrackingId ? (
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <p className="text-[11px] text-[var(--muted)]">
                    ShipIN tracking ID
                  </p>
                  <p className="mt-0.5 font-mono text-[15px] font-medium tracking-tight text-[var(--foreground)]">
                    {request.tracking.internalTrackingId}
                  </p>
                </div>

                <Link
                  href={`/shipment/${request.id}`}
                  className="text-[12px] font-medium text-[var(--foreground)] transition-colors hover:text-[var(--accent)]"
                >
                  Track →
                </Link>
              </div>
            ) : (
              <p className="text-[12px] text-[var(--muted)]">
                Not dispatched yet.
              </p>
            )}
          </section>

          <ProductsCard request={request} />

          <AddItemRequest request={request} />

          <AdditionalItemPaymentsCard
            requestId={request.id}
            additionalItemRequests={request.additionalItemRequests || []}
          />

          {inspectionUrls.length > 0 && (
            <section className="app-panel p-5 sm:p-6">
              <h2 className="app-section-title mb-3.5">
                Inspection photos
              </h2>

              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
                {inspectionUrls.map((photo, index) => (
                  <button
                    key={photo}
                    type="button"
                    onClick={() => {
                      setSelectedPhoto(index);
                      setLightboxOpen(true);
                    }}
                    className="group overflow-hidden rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50"
                  >
                    <img
                      src={photo}
                      alt={`Inspection ${index + 1}`}
                      className="aspect-video w-full object-cover transition duration-300 group-hover:scale-[1.02]"
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
          <QuoteCard request={request} compact />

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
