import { calculatePayment } from "@/features/finance/services/calculatePayment";

export async function buildCheckout(
  request: any,
  walletBalance: number,
  useWallet: boolean
) {
  return calculatePayment({
    breakdown: request.quote.breakdown,
    walletBalance,
    useWallet,
  });
}