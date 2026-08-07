export interface WalletUsage {
  available: number;
  applied: number;
  remaining: number;
}

interface Params {
  balance: number;
  orderTotal: number;
  enabled: boolean;
}

export function calculateWalletUsage({
  balance,
  orderTotal,
  enabled,
}: Params): WalletUsage {
  if (!enabled) {
    return {
      available: balance,
      applied: 0,
      remaining: orderTotal,
    };
  }

  const applied = Math.min(balance, orderTotal);

  return {
    available: balance,
    applied,
    remaining: Math.max(orderTotal - applied, 0),
  };
}