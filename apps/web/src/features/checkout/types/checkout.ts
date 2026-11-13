export interface CheckoutItem {
  id: string;
  title: string;
  image?: string;
  quantity: number;
  weight?: number;
  dimensions?: string;
  country: string;
}

export interface CheckoutCost {
  subtotal: number;
  shipping: number;
  insurance: number;
  taxes: number;
  serviceFee: number;
  additionalServices: number;
  walletApplied: number;
  processingFee: number;
  total: number;
}

export interface CheckoutWallet {
  availableBalance: number;
  reservedBalance: number;
}

export interface CheckoutData {
  requestId: string;
  status: string;

  items: CheckoutItem[];

  costs: CheckoutCost;

  wallet: CheckoutWallet;

  paymentRequired: number;
}