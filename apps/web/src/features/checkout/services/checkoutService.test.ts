import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ calculatePayment: vi.fn() }));

vi.mock('@/features/finance/services/calculatePayment', () => ({
  calculatePayment: mocks.calculatePayment,
}));

import { buildCheckout } from './checkoutService';

const breakdown = {
  items: 100,
  shipping: 20,
  serviceFee: 10,
  total: 130,
};

beforeEach(() => {
  mocks.calculatePayment.mockReset();
  mocks.calculatePayment.mockResolvedValue({ total: 130 });
});

describe('buildCheckout', () => {
  it('refuses a request without a quote', async () => {
    await expect(
      buildCheckout({ id: 'req-1' } as never, 0, false)
    ).rejects.toThrow('Request has no quote to build checkout from.');
    expect(mocks.calculatePayment).not.toHaveBeenCalled();
  });

  it('passes the quote breakdown and wallet choice through', async () => {
    const request = { id: 'req-1', quote: { breakdown } };

    await expect(buildCheckout(request as never, 50, true)).resolves.toEqual({ total: 130 });

    expect(mocks.calculatePayment).toHaveBeenCalledWith({
      breakdown,
      walletBalance: 50,
      useWallet: true,
    });
  });
});
