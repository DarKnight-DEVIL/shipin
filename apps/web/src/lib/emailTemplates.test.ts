/**
 * Tests for the transactional email templates.
 */

import { describe, it, expect } from 'vitest';

import { generateEmail } from './emailTemplates';

const requestId = 'abcdef123456';

describe('generateEmail', () => {
  it('renders a quote with truncated request id and amount', () => {
    const { subject, html } = generateEmail('quote', { requestId, amount: 1234.5 });

    expect(subject).toBe('Your ShipIN Quote is Ready');
    expect(html).toContain('Quote Ready');
    expect(html).toContain('#abcdef');
    expect(html).toContain('$1234.50');
  });

  it('renders a payment confirmation', () => {
    const { subject, html } = generateEmail('payment', { requestId, amount: 99 });

    expect(subject).toBe('Payment Received');
    expect(html).toContain('$99.00');
    expect(html).toContain('purchasing team');
  });

  it('renders the tracking number for shipped mail', () => {
    const { subject, html } = generateEmail('shipped', {
      requestId,
      trackingNumber: 'SHP-123',
    });

    expect(subject).toBe('Your Package Has Shipped');
    expect(html).toContain('SHP-123');
  });

  it('renders an empty tracking block when the number is missing', () => {
    const { html } = generateEmail('shipped', { requestId });

    expect(html).toContain('Tracking Number:</strong>');
  });

  it('renders delivered, refunded and shipment updates', () => {
    expect(generateEmail('delivered', { requestId }).subject).toBe('Package Delivered');
    expect(generateEmail('refunded', { requestId }).subject).toBe('Refund Processed');
    expect(generateEmail('shipment', { requestId }).subject).toBe('Shipment Update');
  });

  it('renders a support reply', () => {
    const { subject, html } = generateEmail('support', {
      requestId,
      supportMessage: 'We shipped it today.',
    });

    expect(subject).toBe('Support Reply');
    expect(html).toContain('We shipped it today.');
  });

  it('escapes user-controlled values in every template', () => {
    const payload = '<script>alert("x")</script>';
    const { html: quote } = generateEmail('quote', {
      requestId: payload,
      amount: 1,
    });
    const { html: support } = generateEmail('support', {
      requestId,
      supportMessage: payload,
    });
    const { html: shipped } = generateEmail('shipped', {
      requestId,
      trackingNumber: payload,
    });

    for (const html of [quote, support, shipped]) {
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;');
    }
    // Unescaped text reaching the support body would render as markup.
    expect(support).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  });

  it('falls back to a generic update for an unknown type', () => {
    const { subject, html } = generateEmail('mystery' as never, { requestId });

    expect(subject).toBe('ShipIN Update');
    expect(html).toContain('You have a new update from ShipIN.');
  });
});
