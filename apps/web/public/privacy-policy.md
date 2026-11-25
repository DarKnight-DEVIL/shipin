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

## 5. Legal Basis for Processing

Where data protection law requires a legal basis (the GDPR in the EEA and UK,
and India's Digital Personal Data Protection Act, 2023), this is what we rely on
for each purpose.

| Purpose | Legal basis | Why |
|---------|-------------|-----|
| Account and sign-in | Contract — Art. 6(1)(b) | There is no service without an account. |
| Buying, inspecting, shipping | Contract — Art. 6(1)(b) | Includes sharing the delivery address with the carrier. |
| Payments, refunds, invoices | Contract + legal obligation — Art. 6(1)(b), (c) | Tax and accounting law requires the records. |
| Fraud prevention, rate limiting, security logs | Legitimate interests — Art. 6(1)(f) | Keeping the platform and payments safe for everyone. |
| Order and status email | Contract — Art. 6(1)(b) | You can turn the channel off from any email. |
| WhatsApp status updates | Consent — Art. 6(1)(a) | Opt-in only, timestamped, revocable in Settings. |
| Error monitoring and aggregate analytics | Legitimate interests — Art. 6(1)(f) | Cookieless and aggregated; no advertising profile. |

We do not make automated decisions that produce legal effects about you, and we
do not sell personal data.

## 6. Analytics

We use **Vercel Analytics** and **Vercel Speed Insights** to understand how our
service is used. These services collect anonymous, aggregated data such as
page views, device type, and performance metrics. No personally identifiable
information is shared with these services.

## 7. Cookies

We do not use cookies for tracking, advertising or analytics. The only cookie we
set is an essential **multi-factor authentication session cookie**
(`shipin_admin_mfa`), issued only after an administrator completes a
security-check challenge. It is set with `HttpOnly`, `Secure`, and
`SameSite=Strict` flags and expires after 30 minutes. All other requests are
authenticated with a bearer token in the request header, never with an ambient
cookie.

## 8. Data Retention

| Record                               | Kept for                                                   |
| ------------------------------------ | ---------------------------------------------------------- |
| Profile and addresses                | Until you delete your account, then anonymised immediately |
| Orders, invoices and payment records | 8 years (tax and accounting law)                           |
| Inspection and packing photos        | 24 months after delivery                                   |
| Support conversations                | 24 months after the ticket closes                          |
| Error and security logs              | 90 days                                                    |
| Backups                              | 7-day point-in-time recovery, 90-day daily exports         |

We retain your personal data for as long as your account is active and as
needed to fulfill your orders. Order and payment records are retained for
legal and tax compliance purposes. You may request deletion of your account
data at any time (see Section 10).

Two of these periods are enforced by an automated daily job rather than left to
routine cleanup: photos are deleted from storage once their 24-month
post-delivery window closes, and a support ticket is deleted with its messages
once it has been resolved for two years. The job deliberately does not touch
orders, invoices or payment records, which the eight-year legal period requires
us to keep. Log and backup retention is configured at the providers listed in
Section 16.

## 9. Data Security

We take reasonable precautions to protect your data:

- All data is stored in **Firebase Firestore** with **row-level security rules**
  that restrict access to your own records
- **Server-side authentication** via Firebase ID tokens (verified, not trusted)
- **Email verification** is required before accessing your account
- **Rate limiting** prevents abuse
- **Content Security Policy** (CSP) blocks cross-site scripting
- **No secrets are stored in logs**
- Payment data is processed by PayPal using their PCI-compliant infrastructure

## 10. Your Rights

Depending on your location, you may have the right to:

- **Access** the personal data we hold about you
- **Correct** inaccurate data
- **Delete** your account and associated data
- **Export** your data in a portable format
- **Object** to or **restrict** certain processing
- **Withdraw consent** for optional features (SMS notifications)

To exercise any of these rights, contact us at the support email address in
your account dashboard.

## 11. Children

ShipIN is not intended for users under the age of 18. We do not knowingly
collect data from children.

## 12. Changes to This Policy

We may update this Privacy Policy from time to time. We will notify you of
significant changes by email or through a notice on our website.

## 13. Contact

For privacy-related questions, data access requests, or to report a concern,
please use the support feature in your account dashboard or email us at
[support@shipin.co](mailto:support@shipin.co).

ShipIN
4th Floor, Trade Center, Andheri East
Mumbai 400069, India

Phone: [+91 22 6823 4567](tel:+912268234567)
Hours: Mon to Sat, 09:00 to 19:00 IST

## 14. Where your data is processed

ShipIN is established in India and processes data there, on Google Cloud
(Firestore) infrastructure. PayPal, Resend and Vercel process payment, email and
hosting data in their own regions under their own terms. If you are in the EEA
or the UK and need the transfer mechanism that applies to your order, and the
contact details of any representative appointed for your jurisdiction, ask us in
writing before you order and we will confirm what is in place.

## 15. Marketing and consent

We do not run marketing or promotional email. Every message you receive is
transactional: a quote, a payment receipt, a shipping update, a support reply,
or a security notice. That is why there is no newsletter toggle in Settings —
there is no newsletter.

- **Email** is on by default because it carries order status. Every message has
  a one-click unsubscribe link and `List-Unsubscribe` headers; unsubscribing
  switches the channel off until you turn it back on in Settings.
- **WhatsApp** updates are never on by default. They require an explicit
  opt-in, which is stored with a consent timestamp, and can be withdrawn at any
  time.
- If we ever introduce marketing email, it will be opt-in only and kept separate
  from transactional mail.

## 16. Sub-processors and data processing agreements

The current sub-processor list is published in the
[Cookie Policy](/cookie-policy): Google Firebase, PayPal, Cloudflare, Resend,
Vercel and Spline. Each is engaged for a specific purpose and receives
only the data that purpose needs.

Each provider is used under the data processing terms it publishes for its
service. If you need the current list, the processing terms on file, or a signed
agreement for your own compliance file, email
[support@shipin.co](mailto:support@shipin.co) and we will send it.

## 17. Personal data breaches

Suspected incidents are logged in an internal breach register with a severity, an
owner and a timeline. Where a breach is likely to put your rights and freedoms at
risk, we notify you without undue delay with what happened, what data was
involved and what you should do — and, where the GDPR applies, we notify the
competent supervisory authority within 72 hours of becoming aware of it.

To report a suspected vulnerability or incident, email
[support@shipin.co](mailto:support@shipin.co).
