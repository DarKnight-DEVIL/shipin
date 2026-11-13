# Privacy Policy

**Last updated:** November 1, 2026
**Effective date:** November 1, 2026

## 1. Overview

ShipIN ("we", "our", "us") is an international shopping forwarding platform that
inspects, packs, and forwards purchases from Indian stores to customers
worldwide. This Privacy Policy describes what personal information we collect,
how we use it, how we share it, and the choices you have regarding your data.

## 2. Information We Collect

### 2.1 Account Information
When you sign in (with Google or email/password), we collect and store:

- **Name** (display name)
- **Email address**
- **Phone number** (optional, for shipment coordination and SMS notifications)
- **Profile photo** (from Google, if you use Google sign-in)

### 2.2 Shipping & Purchase Information
To fulfill your forwarding requests, we collect:

- **Shipping address** (name, address, phone, postal code, country)
- **Item details** for each purchase: product name, quantity, product URL, unit price
- **Order numbers** and **tracking numbers** from carriers
- **Payment details**: PayPal order/capture IDs, amounts paid, currency

### 2.3 Payment Information
Payments are processed by **PayPal**. We do not store your PayPal credentials.
We store only the transaction identifiers and amounts needed to reconcile your
order and issue refunds.

### 2.4 Support Communications
Messages you send through our support system are stored so our team can respond.

### 2.5 Authentication Security
For account protection, we may store multi-factor authentication configuration
(TOTP secrets, backup codes, WebAuthn credential identifiers) if you enable it.
Backup codes are stored hashed.

## 3. How We Use Your Information

- **Fulfill your orders**: inspect, pack, and ship your purchases
- **Communicate with you**: order status updates, quotes, support replies
- **Process payments**: create and reconcile PayPal orders, manage refunds and wallet credits
- **Provide support**: respond to your inquiries
- **Secure your account**: enforce email verification, rate limiting, and MFA
- **Improve our service**: aggregated, anonymous analytics

## 4. How We Share Your Information

We do **not** sell your personal data. We share data only with:

| Recipient | Purpose | Data shared |
|-----------|---------|-------------|
| **PayPal** | Payment processing | Order IDs, amounts, email |
| **Email provider (Gmail SMTP)** | Send order confirmations, verification emails | Recipient email, message content |
| **WhatsApp Business API** | Send order status updates (opt-in) | Phone number, message content |
| **Vercel** | Hosting and analytics | Anonymous, aggregated usage metrics |
| **Carrier services** | Generate shipping labels | Recipient name, address, phone |

## 5. Analytics

We use **Vercel Analytics** and **Vercel Speed Insights** to understand how our
service is used. These services collect anonymous, aggregated data such as
page views, device type, and performance metrics. No personally identifiable
information is shared with these services.

## 6. Cookies

We use a single **CSRF protection cookie** (`csrf_token`). It is set with
`HttpOnly`, `Secure`, and `SameSite=Strict` flags. It is not used for tracking
or advertising.

## 7. Data Retention

We retain your personal data for as long as your account is active and as
needed to fulfill your orders. Order and payment records are retained for
legal and tax compliance purposes. You may request deletion of your account
data at any time (see Section 9).

## 8. Data Security

We take reasonable precautions to protect your data:

- All data is stored in **Firebase Firestore** with **row-level security rules**
  that restrict access to your own records
- **Server-side authentication** via Firebase ID tokens (verified, not trusted)
- **Email verification** is required before accessing your account
- **Rate limiting** prevents abuse
- **Content Security Policy** (CSP) blocks cross-site scripting
- **No secrets are stored in logs**
- Payment data is processed by PayPal using their PCI-compliant infrastructure

## 9. Your Rights

Depending on your location, you may have the right to:

- **Access** the personal data we hold about you
- **Correct** inaccurate data
- **Delete** your account and associated data
- **Export** your data in a portable format
- **Object** to or **restrict** certain processing
- **Withdraw consent** for optional features (SMS notifications)

To exercise any of these rights, contact us at the support email address in
your account dashboard.

## 10. Children

ShipIN is not intended for users under the age of 18. We do not knowingly
collect data from children.

## 11. Changes to This Policy

We may update this Privacy Policy from time to time. We will notify you of
significant changes by email or through a notice on our website.

## 12. Contact

For privacy-related questions, data access requests, or to report a concern,
please use the support feature in your account dashboard.