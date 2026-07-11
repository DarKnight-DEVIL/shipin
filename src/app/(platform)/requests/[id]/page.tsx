"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, updateDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import SupportCenter from "@/components/support/SupportCenter";
import { canCreateSupportTicket } from "@/lib/support";
import RequestHeader from "@/components/request/RequestHeader";
import RequestTimeline from "@/components/request/RequestTimeline";
import TrackingCard from "@/components/request/TrackingCard";
import ProductsCard from "@/components/request/ProductsCard";
import QuoteCard from "@/components/request/QuoteCard";
import PaymentCard from "@/components/request/PaymentCard";
import type { Request } from "@/types/request";

export default function RequestDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const requestId = params.id as string;

  const [request, setRequest] = useState<Request | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);

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
        console.error(error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [requestId]);

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
      alert(
        error instanceof Error
          ? error.message
          : "Something went wrong approving the quote."
      );
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-white">Loading request...</div>;
  }

  if (!request) {
    return <div className="p-8 text-white">Request not found.</div>;
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      
      {/* Upgraded Native Modular Header */}
      <RequestHeader request={request} />

      {/* Integrated Modular Request Timeline Component */}
      <RequestTimeline status={request.status} />

      {/* Integrated Modular Tracking Card Component */}
      <TrackingCard tracking={request.tracking} />

      {/* Integrated Modular Products Card Component */}
      <ProductsCard
        items={request.items || []}
        quote={request.quote}
      />

      {/* Integrated Modular Quote Breakdown Card Component */}
      <QuoteCard quote={request.quote} />

      {/* Integrated Modular Payment Actions Card Component */}
      <PaymentCard
        request={request}
        onApproveQuote={handleApproveQuote}
        approving={approving}
      />

      {/* Support Module */}
      <SupportCenter
        requestId={request.id}
        customerId={request.userId}
        canCreateTicket={canCreateSupportTicket(request)}
      />
    </div>
  );
}