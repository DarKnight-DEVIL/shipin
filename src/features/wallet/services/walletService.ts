import { getWallet } from "@/lib/wallet";

class WalletService {

  async getBalance(userId: string) {

    const wallet =
      await getWallet(userId);

    return wallet.balance;

  }

}

export const walletService =
new WalletService();