import { auth } from "@/lib/firebase";
import { getRequestById } from "@/lib/firestore";
import { getWallet } from "@/lib/wallet";

export async function getCheckoutData(
  requestId: string
) {
  const request = await getRequestById(requestId);

  if (!request) {
    return null;
  }

  let walletBalance = 0;

  const user = auth.currentUser;

  if (user) {
    const wallet = await getWallet(user.uid);
    walletBalance = wallet.balance;
  }

  return {
    request,
    walletBalance,
  };
}