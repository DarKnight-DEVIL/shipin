"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, updateDoc, onSnapshot } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { toast } from "sonner";

import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";

import SupportCenter from "@/components/support/SupportCenter";
import { canCreateSupportTicket } from "@/lib/support";

import RequestHeader from "@/components/request/RequestHeader";
import RequestTimeline from "@/components/request/RequestTimeline";
import ProductsCard from "@/components/request/ProductsCard";
import QuoteCard from "@/components/request/QuoteCard";
import RequestPaymentStatus from "@/components/request/RequestPaymentStatus";
import AddItemRequest from "@/components/request/AddItemRequest";
import AdditionalItemPaymentsCard from "@/components/request/AdditionalItemPaymentsCard";

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

  // State for presigned inspection photo URLs
  const [inspectionUrls, setInspectionUrls] = useState<string[]>([]);

  // State for Lightbox viewer
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(0);

  /*
   * LIVE FIRESTORE LISTENER
   *
   * This means we do NOT need to reload the page
   * after an additional-item payment.
   *
   * When the PayPal capture API updates Firestore:
   *
   * awaiting_payment → paid
   *
   * onSnapshot receives the updated request
   * automatically and React re-renders the page.
   */
  useEffect(() => {
    if (!requestId) return;

    const requestRef = doc(db, "requests", requestId);

    const unsubscribe = onSnapshot(
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

    return () => unsubscribe();
  }, [requestId]);

  // Fetch presigned URLs securely using Bearer ID Token authentication
  useEffect(() => {
    async function loadInspectionPhotos() {
      if (!request?.warehouse?.inspectionPhotos?.length) {
        setInspectionUrls([]);
        return;
      }


      try {
        const currentUser = auth.currentUser;

        if (!currentUser) {
          return;
        }

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
      } catch (err) {
        console.error(err);
      }
    }

    loadInspectionPhotos();
  }, [request]);

  /*
   * MAIN QUOTE APPROVAL
   */
  const handleApproveQuote = async () => {
    if (!requestId) return;

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
          error instanceof Error
            ? error.message
            : undefined,
      });
    } finally {
      setApproving(false);
    }
  };

  /*
   * LOADING
   */
  if (loading) {
    return <div className="p-8 text-slate-700 dark:text-slate-300">Loading request...</div>;
  }

  /*
   * REQUEST NOT FOUND
   */
  if (!request) {
    return <div className="p-8 text-slate-700 dark:text-slate-300">Request not found.</div>;
  }

  /*
   * QUOTE EXPIRATION
   */
  const quoteExpired = isQuoteExpired(request.quote?.expiresAt);

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      {/* REQUEST HEADER */}
      <RequestHeader request={request} />

      {/* REQUEST TIMELINE */}
      <RequestTimeline 
        status={request.status}
        history={request.statusHistory}
        orderChange={request.orderChange}
      />

      {/* SHIPMENT TRACKING */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
          Shipment
        </h2>

        {request.tracking?.internalTrackingId ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <p className="text-sm text-slate-400">ShipIN Tracking ID</p>
            <p className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
              {request.tracking.internalTrackingId}
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
      <ProductsCard request={request} />

      {/* ADD ITEM REQUEST */}
      <AddItemRequest request={request} />

      {/* ADDITIONAL ITEM PAYMENTS */}
      <AdditionalItemPaymentsCard
        requestId={request.id}
        additionalItemRequests={request.additionalItemRequests || []}
      />

      {/* MAIN QUOTE */}
      <QuoteCard request={request} />

      {/* QUOTE COUNTDOWN */}
      {request.quote?.expiresAt && request.status === "review" && (
        <QuoteCountdown expiresAt={request.quote.expiresAt} />
      )}

      {/* MAIN PAYMENT ACTIONS */}
      <RequestPaymentStatus
        request={request}
        onApproveQuote={handleApproveQuote}
        approving={approving}
      />

      {/* QUOTE EXPIRED BANNER */}
      {quoteExpired &&
        (request.status === "review" || request.status === "awaiting_payment") && (
          <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-xl p-5">
            <h2 className="text-red-400 font-semibold">Quote Expired</h2>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              This quote has expired and can no longer be used for payment.
              Please request a new quote.
            </p>
          </div>
        )}

      {/* INSPECTION PHOTOS */}
      {inspectionUrls && inspectionUrls.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <h2 className="mb-5 text-xl font-semibold text-slate-950 dark:text-white">
            Inspection Photos
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {inspectionUrls.map((photo, index) => (
              <img
                key={photo}
                src={photo}
                alt="Inspection"
                onClick={() => {
                  setSelectedPhoto(index);
                  setLightboxOpen(true);
                }}
                className="cursor-zoom-in rounded-xl border border-slate-700 aspect-video object-cover hover:scale-[1.02] transition"
              />
            ))}
          </div>

          <Lightbox
            open={lightboxOpen}
            close={() => setLightboxOpen(false)}
            slides={inspectionUrls.map((url) => ({ src: url }))}
            index={selectedPhoto}
          />
        </div>
      )}

      {/* SUPPORT */}
      <SupportCenter
        requestId={request.id}
        customerId={request.userId}
        canCreateTicket={canCreateSupportTicket(request)}
      />
    </div>
  );
}