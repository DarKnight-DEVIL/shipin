import CheckoutHeader from "@/components/checkout/CheckoutHeader";
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

  const checkout = await getCheckoutData(id);

  if (!checkout) {
    return (
      <main className="min-h-screen flex items-center justify-center text-white">
        Request not found.
      </main>
    );
  }

  const { request, walletBalance } = checkout;

  const payment = calculatePayment({
    breakdown: request.quote!.breakdown,
    walletBalance,
    useWallet: true,
  });

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <div className="mx-auto max-w-7xl px-6 py-8">

        <CheckoutHeader
          requestId={request.id.slice(0, 6)}
          status={request.status}
        />

        <div className="mt-8 grid gap-6 lg:grid-cols-3">

          <div className="space-y-6 lg:col-span-2">

            <OrderSummary request={request} />

            <CostBreakdown
              payment={payment}
            />

          </div>

          <div className="space-y-6 lg:sticky lg:top-8 self-start">

            <PaymentCard
              request={request}
              walletBalance={walletBalance}
            />

            <SecurityCard />

          </div>

        </div>

        <div className="mt-8">
          <Timeline />
        </div>

        <div className="mt-8">
          <HelpCard />
        </div>

      </div>
    </main>
  );
}