# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

International shoppers who want to purchase products from Indian online stores that don't offer international shipping. They face geographic restrictions, unfamiliar payment systems, and lack local addresses in India to receive purchases.

Secondary audience: Indian diaspora seeking regional products from home.

## Product Purpose

ShipIN enables anyone worldwide to buy from Indian e-commerce stores by acting as a purchasing and forwarding service. Customers paste product links, ShipIN purchases the items in India, receives them at a warehouse, inspects and consolidates packages, then ships internationally.

Success means customers receive Indian products without dealing with payment barriers, address restrictions, or surprise fees.

## Positioning

ShipIN handles the entire purchase transaction from Indian stores, not just package forwarding. Customers don't need an Indian payment method, address, or account—ShipIN buys for them, inspects items at a warehouse, and provides end-to-end tracking with transparent upfront quotes covering all costs including inspection, consolidation, and international shipping.

## Operating Context

**Customer workflow:**
1. Create request by pasting product URLs from Indian stores
2. Receive and approve a detailed quote (products, domestic shipping, international shipping, service fees, inspection fees)
3. Pay securely via PayPal or wallet balance
4. Track order status through stages: purchased → warehouse received → inspected → packed → shipped → delivered
5. Optional: request additional items while in warehouse, choose shipping hold, or consolidate multiple orders

**Admin workflow:**
Purchase requests → quote generation → payment verification → procurement → warehouse receiving → inspection with photos → packing → international shipping arrangement → tracking updates

**Technical context:**
Next.js web app with Firebase Auth and Firestore. PayPal integration for payments. Cloudflare R2 for inspection photo storage. Email notifications at each status milestone.

## Capabilities and Constraints

**Core capabilities:**
- Multi-item request submission with product URLs
- Transparent quote breakdown (product cost, domestic shipping, international shipping, service fee, optional inspection fee)
- Wallet system for refunds and future purchases
- Inspection services (none, standard, detailed) with photo documentation
- Package consolidation to reduce shipping costs
- Additional item requests mid-process
- Order modification with repacking capability
- Partial and full refund handling
- Internal tracking ID system with carrier integration
- Customer support ticket system
- Admin dashboard for request management, purchasing workflow, warehouse operations, and financial tracking

**Constraints:**
- Source limited to Indian online stores
- Requires working product URLs
- Payment in USD via PayPal or wallet
- Warehouse inspection delays shipment (standard: 1-2 days, detailed: 2-3 days)
- Storage fees after free holding period
- Repacking fees for order modifications after initial packing

**Terminology:**
- "Request" not "order" (customer creates requests; ShipIN places orders)
- "Warehouse received" status distinct from "delivered" (warehouse = India; delivered = customer)
- "Consolidation" = combining multiple requests into one shipment
- "Inspection photos" = warehouse documentation of received items

## Evidence on Hand

**Real testimonials with attribution:**
- u/Valuable_Farm_2686 (Stralsund, Germany, 2026-05-26)
- u/Logical-Hawk8 (Palm Harbor, USA, 2026-08-15)
- u/pookiemjmi (Vietnam, 2026-09-17)
- Karlek Kouaya (France, 2026-10-04)

**Contact:** contact.shipin@gmail.com  
**Operations:** India-based warehouse

**Missing evidence that should not be fabricated:**
- Specific shipping times or delivery guarantees
- Pricing examples or quote amounts
- Number of countries served
- Volume of requests processed
- Specific carrier partnerships beyond operational use

## Product Principles

1. **Transparency over surprises** — Upfront quotes with complete cost breakdown. No hidden fees or unexpected charges at delivery.

2. **Purchase enablement, not just forwarding** — Handle the entire transaction so customers without Indian payment methods or addresses can still buy.

3. **Inspection as trust** — Optional warehouse inspection with photos gives customers confidence before international shipping, especially for high-value or fragile items.

4. **Status clarity** — Clear tracking through distinct stages (purchased, warehouse received, inspected, packed, shipped, delivered) so customers always know where their items are.

5. **Flexible service tiers** — From no-inspection express to detailed inspection with hold, customers choose the speed-versus-verification trade-off that matches their needs.
