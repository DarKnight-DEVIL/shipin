export const formatCurrency = (
  amount: number,
  currency = 'USD',
  locale = 'en-US'
): string => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const parseCurrency = (value: string): number => {
  const num = parseFloat(value.replace(/[^0-9.-]/g, ''));
  return isNaN(num) ? 0 : num;
};

export const roundToCents = (amount: number): number => {
  return Math.round(amount * 100) / 100;
};

export const calculatePercentage = (value: number, total: number): number => {
  if (total === 0) return 0;
  return roundToCents((value / total) * 100);
};

export const addTax = (amount: number, taxRate: number): number => {
  return roundToCents(amount * (1 + taxRate / 100));
};

export const subtractTax = (amount: number, taxRate: number): number => {
  return roundToCents(amount / (1 + taxRate / 100));
};