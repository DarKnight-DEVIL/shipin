import Link from "next/link";
import { ReceiptText } from "lucide-react";

import CheckoutHeader from "@/components/checkout/CheckoutHeader";
import EmptyState from "@/components/ui/EmptyState";
import OrderSummary from "@/components/checkout/OrderSummary";
import CostBreakdown from "@/components/checkout/CostBreakdown";
import PaymentCard from "@/components/checkout/PaymentCard";
import Timeline from "@/components/checkout/Timeline";
import SecurityCard from "@/components/checkout/SecurityCard";
import HelpCard from "@/components/checkout/HelpCard";

import { getCheckoutData } from "@/features/checkout/services/getCheckoutData";
import { calculatePayment } from "@/features/finance/calculatePayment";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const checkout = await getCheckoutData(id).catch((error) => {
    console.error("Checkout data failed:", error);
    return null;
  });

  if (!checkout) {
    return (
      <div className="app-page">
        <EmptyState
          icon={<ReceiptText size={18} />}
          title="Checkout unavailable"
          description="This request doesn’t exist yet, or its quote hasn’t been issued. Open your requests to check its status."
          action={
            <Link href="/requests" className="app-btn app-btn-primary">
              Back to requests
            </Link>
          }
        />
      </div>
    );
  }

  const { request, walletBalance } = checkout;

  const payment = calculatePayment({
    breakdown: request.quote!.breakdown,
    walletBalance,
    useWallet: true,
  });

  return (
    <div className="app-page">
      <div>

        <CheckoutHeader
          requestId={request.id.slice(0, 6)}
          status={request.status}
        />

        <div className="mt-6 grid gap-5 lg:grid-cols-3">

          <div className="space-y-5 lg:col-span-2">

            <OrderSummary request={request} />

            <CostBreakdown
              payment={payment}
            />

          </div>

          <div className="space-y-5 self-start lg:sticky lg:top-6">

            <PaymentCard
              request={request}
              walletBalance={walletBalance}
            />

            <SecurityCard />

          </div>

        </div>

        <div className="mt-5">
          <Timeline />
        </div>

        <div className="mt-5">
          <HelpCard />
        </div>
      </div>
    </div>
  );
}