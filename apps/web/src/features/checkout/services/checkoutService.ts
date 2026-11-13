import { calculatePayment } from "@/features/finance/services/calculatePayment";

export async function buildCheckout(
  request: import("@/types/request").Request,
  walletBalance: number,
  useWallet: boolean
) {
  if (!request.quote) {
    throw new Error("Request has no quote to build checkout from.");
  }
  return calculatePayment({
    breakdown: request.quote.breakdown,
    walletBalance,
    useWallet,
  });
}