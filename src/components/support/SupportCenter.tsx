"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { doc, getDoc } from "firebase/firestore";

import { db, auth } from "@/lib/firebase";
import useSupport from "@/hooks/useSupport";

import SupportTicketList from "./SupportTicketList";
import SupportConversation from "./SupportConversation";
import NewTicketModal from "./NewTicketModal";
import EmptyState from "@/components/ui/EmptyState";

interface Props {
  requestId: string;
  customerId: string;
  isAdmin?: boolean;
  canCreateTicket?: boolean;
}

type PartialRefundOffer = {
  id: string;
  amount: number;
  reason: string;
  status: "offered" | "accepted" | "completed" | "declined";
  selectedMethod?: "wallet" | "original_payment";
};

export default function SupportCenter({
  requestId,
  customerId,
  isAdmin = false,
  canCreateTicket = true,
}: Props) {
  const support = useSupport(requestId, isAdmin);

  const [showModal, setShowModal] = useState(false);
  const [reply, setReply] = useState("");

  // Full refund offer state
  const [refundOffer, setRefundOffer] = useState(false);
  const [refundOfferReason, setRefundOfferReason] = useState("");
  const [refundPreference, setRefundPreference] = useState<
    "wallet" | "original_payment" | "original_sources"
  >("wallet");
  const [refundSubmitting, setRefundSubmitting] = useState(false);

  // Partial refund offer state
  const [partialRefundOffer, setPartialRefundOffer] =
    useState<PartialRefundOffer | null>(null);

  const [partialRefundPreference, setPartialRefundPreference] =
    useState<"wallet" | "original_payment">("wallet");

  const [partialRefundSubmitting, setPartialRefundSubmitting] =
    useState(false);

  const [paymentBreakdown, setPaymentBreakdown] = useState({
    walletAmount: 0,
    paypalAmount: 0,
  });

  useEffect(() => {
    if (!requestId || isAdmin) {
      return;
    }

    async function loadRefundOffer() {
      try {
        const snapshot = await getDoc(doc(db, "requests", requestId));

        if (!snapshot.exists()) {
          return;
        }

        const data = snapshot.data();

        const partialOffer = data.partialRefundOffer;

        if (
          partialOffer &&
          ["offered", "accepted", "completed", "declined"].includes(
            partialOffer.status
          )
        ) {
          setPartialRefundOffer({
            id: partialOffer.id,
            amount: Number(partialOffer.amount ?? 0),
            reason: partialOffer.reason ?? "",
            status: partialOffer.status,
            selectedMethod: partialOffer.selectedMethod,
          });
        } else {
          setPartialRefundOffer(null);
        }

        // Do not show the old full-refund offer while a
        // partial-refund offer exists.
        setRefundOffer(
          data.refundOffer?.offered === true &&
            !data.refundRequest &&
            !partialOffer
        );

        setRefundOfferReason(data.refundOffer?.reason ?? "");

        setPaymentBreakdown({
          walletAmount: Number(data.payment?.walletAmount ?? 0),
          paypalAmount: Number(data.payment?.paypalAmount ?? 0),
        });
      } catch (error) {
        console.error("Unable to load refund offer:", error);
      }
    }

    loadRefundOffer();
  }, [requestId, isAdmin]);

  async function handlePartialRefundAcceptance() {
    if (partialRefundSubmitting) {
      return;
    }

    try {
      setPartialRefundSubmitting(true);

      const user = auth.currentUser;

      if (!user) {
        throw new Error(
          "Your session has expired. Please refresh the page and try again."
        );
      }

      const idToken = await user.getIdToken(true);

      const response = await fetch(
        `/api/requests/${requestId}/partial-refund`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            preference: partialRefundPreference,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || "Unable to accept partial refund."
        );
      }

      if (result.offer) {
        setPartialRefundOffer({
          id: result.offer.id,
          amount: Number(result.offer.amount ?? 0),
          reason: result.offer.reason ?? "",
          status: result.offer.status,
          selectedMethod: result.offer.selectedMethod,
        });
      } else {
        setPartialRefundOffer((current) =>
          current
            ? {
                ...current,
                status:
                  partialRefundPreference === "wallet"
                    ? "completed"
                    : "accepted",
                selectedMethod: partialRefundPreference,
              }
            : current
        );
      }

      toast.success(
        partialRefundPreference === "wallet"
          ? "Partial refund credited to your ShipIN Wallet."
          : "Partial refund accepted. It is now awaiting processing."
      );
    } catch (error) {
      console.error(
        "Unable to accept partial refund:",
        error
      );

      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to accept partial refund."
      );
    } finally {
      setPartialRefundSubmitting(false);
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Ticket List */}
        <div className="lg:col-span-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-2xl font-bold text-slate-950 dark:text-white">
              Support
            </h2>

            {!isAdmin &&
              (canCreateTicket ? (
                <button
                  type="button"
                  onClick={() => setShowModal(true)}
                  className="rounded-xl bg-purple-600 px-4 py-2 font-medium text-white transition hover:bg-purple-700"
                >
                  New Ticket
                </button>
              ) : (
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  Support window closed.
                </div>
              ))}
          </div>

          {/* FULL REFUND OFFER */}
          {!isAdmin && refundOffer && !partialRefundOffer && (
            <div
              id="refund-offer"
              className="mb-6 scroll-mt-8 rounded-2xl border border-red-500/20 bg-red-500/5 p-5 dark:bg-red-500/[0.04]"
            >
              <div className="mb-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Refund Offered
                  </h3>

                  <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-600 dark:text-red-400">
                    Action Required
                  </span>
                </div>

                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Our support team has offered a full refund for this
                  order. Please select your preferred refund method.
                </p>

                {refundOfferReason && (
                  <div className="mt-4 rounded-xl border border-red-500/10 bg-white p-4 dark:bg-slate-900">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Reason
                    </p>

                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                      {refundOfferReason}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 transition dark:border-slate-800 dark:bg-slate-900">
                  <input
                    type="radio"
                    name="refundPreference"
                    value="wallet"
                    checked={refundPreference === "wallet"}
                    onChange={() => setRefundPreference("wallet")}
                    className="mt-1 text-purple-600 focus:ring-purple-500"
                  />

                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">
                      Store Wallet
                    </p>

                    <p className="mt-0.5 text-xs text-slate-500">
                      Instant credit applied to your balance for future
                      orders.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 transition dark:border-slate-800 dark:bg-slate-900">
                  <input
                    type="radio"
                    name="refundPreference"
                    value="original_payment"
                    checked={refundPreference === "original_payment"}
                    onChange={() =>
                      setRefundPreference("original_payment")
                    }
                    className="mt-1 text-purple-600 focus:ring-purple-500"
                  />

                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">
                      Original Payment Method
                    </p>

                    <p className="mt-0.5 text-xs text-slate-500">
                      Returned directly to your original method of
                      payment.
                    </p>
                  </div>
                </label>

                {paymentBreakdown.walletAmount > 0 &&
                  paymentBreakdown.paypalAmount > 0 && (
                    <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 transition dark:border-slate-800 dark:bg-slate-900">
                      <input
                        type="radio"
                        name="refundPreference"
                        value="original_sources"
                        checked={
                          refundPreference === "original_sources"
                        }
                        onChange={() =>
                          setRefundPreference("original_sources")
                        }
                        className="mt-1 text-purple-600 focus:ring-purple-500"
                      />

                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">
                          Refund using original payment sources
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          Wallet amount → Wallet
                          <br />
                          PayPal amount → PayPal
                        </p>
                      </div>
                    </label>
                  )}
              </div>

              <button
                type="button"
                disabled={refundSubmitting}
                onClick={async () => {
                  try {
                    setRefundSubmitting(true);

                    const response = await fetch(
                      `/api/requests/${requestId}/refund`,
                      {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                          preference: refundPreference,
                        }),
                      }
                    );

                    const result = await response.json();

                    if (!response.ok || !result.success) {
                      throw new Error(
                        result.error ||
                          "Unable to submit refund request."
                      );
                    }

                    setRefundOffer(false);

                    toast.success(
                      "Refund request submitted successfully."
                    );
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Unable to submit refund request."
                    );
                  } finally {
                    setRefundSubmitting(false);
                  }
                }}
                className="mt-5 w-full rounded-xl bg-red-600 py-3 font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {refundSubmitting
                  ? "Submitting..."
                  : "Request Refund"}
              </button>
            </div>
          )}

          {/* PARTIAL REFUND STATUS */}
          {!isAdmin && partialRefundOffer && (
            <div
              id="partial-refund"
              className="mb-6 scroll-mt-8 rounded-2xl border border-orange-500/20 bg-orange-500/5 p-5 dark:bg-orange-500/[0.04]"
            >
              <div className="mb-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Partial Refund
                  </h3>

                  {partialRefundOffer.status === "offered" && (
                    <span className="rounded-full bg-orange-500/10 px-3 py-1 text-xs font-semibold text-orange-600 dark:text-orange-400">
                      Action Required
                    </span>
                  )}

                  {partialRefundOffer.status === "accepted" && (
                    <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
                      Awaiting Processing
                    </span>
                  )}

                  {partialRefundOffer.status === "completed" && (
                    <span className="rounded-full bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-600 dark:text-green-400">
                      Completed
                    </span>
                  )}

                  {partialRefundOffer.status === "declined" && (
                    <span className="rounded-full bg-slate-500/10 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                      Declined
                    </span>
                  )}
                </div>

                {partialRefundOffer.status === "offered" && (
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Our support team has offered you a partial
                    refund. Choose how you would like to receive it.
                  </p>
                )}

                {partialRefundOffer.status === "accepted" && (
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    You accepted this partial refund using your
                    original payment method. Our team will process
                    the refund manually.
                  </p>
                )}

                {partialRefundOffer.status === "completed" && (
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Your partial refund has been completed.
                  </p>
                )}

                {partialRefundOffer.status === "declined" && (
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    This partial refund offer is no longer available.
                  </p>
                )}

                <div className="mt-4 rounded-xl border border-orange-500/10 bg-white p-4 dark:bg-slate-900">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Refund Amount
                    </p>

                    <p className="text-xl font-bold text-orange-600 dark:text-orange-400">
                      ${partialRefundOffer.amount.toFixed(2)}
                    </p>
                  </div>

                  {partialRefundOffer.reason && (
                    <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Reason
                      </p>

                      <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                        {partialRefundOffer.reason}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* CUSTOMER ACTION */}
              {partialRefundOffer.status === "offered" && (
                <>
                  <div className="space-y-3">
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-purple-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-purple-700">
                      <input
                        type="radio"
                        name="partialRefundPreference"
                        value="wallet"
                        checked={
                          partialRefundPreference === "wallet"
                        }
                        onChange={() =>
                          setPartialRefundPreference("wallet")
                        }
                        className="mt-1 text-purple-600 focus:ring-purple-500"
                      />

                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">
                          ShipIN Wallet
                        </p>

                        <p className="mt-0.5 text-xs text-slate-500">
                          Instant credit applied to your ShipIN
                          Wallet.
                        </p>
                      </div>
                    </label>

                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-purple-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-purple-700">
                      <input
                        type="radio"
                        name="partialRefundPreference"
                        value="original_payment"
                        checked={
                          partialRefundPreference ===
                          "original_payment"
                        }
                        onChange={() =>
                          setPartialRefundPreference(
                            "original_payment"
                          )
                        }
                        className="mt-1 text-purple-600 focus:ring-purple-500"
                      />

                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">
                          Original Payment Method
                        </p>

                        <p className="mt-0.5 text-xs text-slate-500">
                          Our team will process the refund through
                          your original payment method.
                        </p>
                      </div>
                    </label>
                  </div>

                  <button
                    type="button"
                    disabled={partialRefundSubmitting}
                    onClick={handlePartialRefundAcceptance}
                    className="mt-5 w-full rounded-xl bg-orange-600 py-3 font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {partialRefundSubmitting
                      ? "Processing..."
                      : "Accept Partial Refund"}
                  </button>
                </>
              )}

              {/* ACCEPTED STATUS */}
              {partialRefundOffer.status === "accepted" && (
                <div className="mt-4 rounded-xl border border-blue-500/10 bg-blue-500/5 p-4">
                  <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    Refund processing
                  </p>

                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    You do not need to take any further action.
                    Your selected refund method is being processed
                    by ShipIN.
                  </p>
                </div>
              )}

              {/* COMPLETED STATUS */}
              {partialRefundOffer.status === "completed" && (
                <div className="mt-4 rounded-xl border border-green-500/10 bg-green-500/5 p-4">
                  <p className="text-sm font-medium text-green-700 dark:text-green-300">
                    Refund completed
                  </p>

                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    The ${partialRefundOffer.amount.toFixed(2)}{" "}
                    partial refund has been completed.
                  </p>
                </div>
              )}
            </div>
          )}

          {support.tickets.length === 0 ? (
            <EmptyState
              icon={<MessageCircle size={26} />}
              title="No support conversations"
              description="If you need help with this request, our support team is here for you."
            />
          ) : (
            <SupportTicketList
              tickets={support.tickets}
              selectedTicket={support.selectedTicket?.id}
              onSelect={support.setSelectedTicket}
            />
          )}
        </div>

        {/* Conversation */}
        <div className="lg:col-span-8">
          {support.selectedTicket ? (
            <SupportConversation
              ticket={support.selectedTicket}
              messages={support.messages}
              reply={reply}
              onReplyChange={setReply}
              onSend={async () => {
                if (!reply.trim() || !support.selectedTicket) {
                  return;
                }

                try {
                  await support.sendMessage({
                    ticketId: support.selectedTicket.id,
                    sender: isAdmin ? "admin" : "customer",
                    message: reply,
                  });

                  setReply("");
                } catch (err) {
                  console.error(err);
                }
              }}
              onResolve={async () => {
                if (!support.selectedTicket) {
                  return;
                }

                await support.resolveTicket(
                  support.selectedTicket.id
                );
              }}
              isAdmin={isAdmin}
            />
          ) : (
            <div className="flex h-full min-h-[300px] items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
              <div>
                <p className="font-medium text-slate-700 dark:text-slate-300">
                  Select a ticket
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  Choose a support ticket to view the conversation.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <NewTicketModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreate={async (category, subject, message) => {
          try {
            await support.createTicket({
              requestId,
              customerId,
              category,
              subject,
              firstMessage: message,
            });

            setShowModal(false);
            setReply("");
          } catch (error) {
            console.error(error);
            toast.error("Failed to create ticket.");
          }
        }}
      />
    </>
  );
}