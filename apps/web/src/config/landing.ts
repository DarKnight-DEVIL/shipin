/**
 * Landing page static content configuration.
 *
 * All hardcoded marketing data lives here so page components stay thin
 * and content can be updated without touching UI components.
 */

export interface Plan {
  id: "standard" | "express" | "merchant";
  code: string;
  name: string;
  price: string;
  unit: string;
  description: string;
  features: string[];
  cta: string;
  featured?: boolean;
}

export type PlanId = Plan["id"];

export const plans: Plan[] = [
  {
    id: "standard",
    code: "Tier 01",
    name: "Standard",
    price: "$0",
    unit: "per request",
    description:
      "For a first order or a single item you cannot get shipped.",
    features: [
      "Standard inspection at the hub",
      "Up to 3 SKUs per request",
      "2 origin stores",
      "Email support, Mon to Sat",
    ],
    cta: "Select Standard",
  },
  {
    id: "express",
    code: "Tier 02",
    name: "Express",
    price: "$9",
    unit: "per request",
    description: "For launches, samples and anything with a date attached.",
    features: [
      "Priority queue at every checkpoint",
      "Photo QA before dispatch",
      "30 days of free warehousing",
      "Consolidation included",
    ],
    cta: "Select Express",
    featured: true,
  },
  {
    id: "merchant",
    code: "Tier 03",
    name: "Merchant",
    price: "Freight",
    unit: "quoted per lane",
    description: "For teams moving 50 or more parcels a month.",
    features: [
      "Unlimited SKUs and stores",
      "Negotiated freight rates",
      "Dedicated account lead",
      "Net 15 terms on approval",
    ],
    cta: "Request a quote",
  },
];

export interface Corridor {
  route: string;
  transit: string;
  cutoff: string;
}

export const corridors: Corridor[] = [
  { route: "Mumbai to London", transit: "5 to 7 days", cutoff: "Tue, Fri" },
  { route: "Mumbai to Dubai", transit: "3 to 4 days", cutoff: "Daily" },
  { route: "Mumbai to Singapore", transit: "3 to 5 days", cutoff: "Mon, Wed, Fri" },
  { route: "Mumbai to Berlin", transit: "6 to 8 days", cutoff: "Wed, Sat" },
  { route: "Mumbai to New York", transit: "7 to 9 days", cutoff: "Tue, Thu" },
  { route: "Mumbai to Toronto", transit: "8 to 10 days", cutoff: "Thu" },
];

export interface Metric {
  value: string;
  label: string;
  detail: string;
}

export const metrics: Metric[] = [
  {
    value: "42",
    label: "Shipping corridors",
    detail: "Direct lanes from the Mumbai hub to six continents.",
  },
  {
    value: "6.2",
    label: "Median transit",
    detail: "Door to door, customs cleared, last quarter.",
  },
  {
    value: "98.7%",
    label: "Delivery success",
    detail: "Parcels delivered on first attempt, last 90 days.",
  },
  {
    value: "4.3",
    label: "Avg. cost savings",
    detail: "Vs. direct carrier booking, per consolidated manifest.",
  },
];

export const marketTicker = [
  "London",
  "Dubai",
  "Singapore",
  "New York",
  "Toronto",
  "Berlin",
  "Sydney",
  "Nairobi",
  "Tokyo",
  "São Paulo",
];

export interface FAQItem {
  question: string;
  answer: string;
}

export const faqItems: FAQItem[] = [
  {
    question: "How do I create a request?",
    answer:
      "Paste product links from Indian stores into the request form. We fetch the details, generate a quote with all costs (product, domestic shipping, international shipping, service fee, optional inspection), and you approve before we buy.",
  },
  {
    question: "What payment methods are accepted?",
    answer:
      "We accept PayPal (credit/debit card or PayPal balance) and wallet credits. Wallet credits can be topped up via PayPal and are used automatically for future requests.",
  },
  {
    question: "How long does shipping take?",
    answer:
      "Transit times vary by corridor (typically 3–10 days door-to-door after export). Customs holds can add time. Check the corridor table for estimates.",
  },
  {
    question: "What happens if an item is damaged or wrong?",
    answer:
      "Our standard inspection catches mismatches at the hub. If something slips through, you can open a support ticket with photos. We offer partial or full refunds based on the issue.",
  },
  {
    question: "Can I consolidate multiple orders?",
    answer:
      "Yes. While items are at the Mumbai hub, you can request consolidation into a single international shipment to save on freight. Additional items can be added to existing requests.",
  },
  {
    question: "Is there a minimum order value?",
    answer:
      "No minimum. Standard tier has no subscription or minimum — pay per request. Express tier adds a $9/request priority fee. Merchant tier is volume-based.",
  },
  {
    question: "How are duties and taxes handled?",
    answer:
      "All duties, taxes, and freight are quoted upfront before you approve the request. No surprise fees at delivery. Duties are prepaid on Express and Merchant tiers.",
  },
];

export interface FooterLink {
  label: string;
  href: string;
}

export interface FooterColumn {
  title: string;
  links: FooterLink[];
}

export const footerColumns: FooterColumn[] = [
  {
    title: "Platform",
    links: [
      { label: "Pipeline", href: "#platform" },
      { label: "Network", href: "#network" },
      { label: "Pricing", href: "#pricing" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "New request", href: "/requests/new" },
      { label: "Contact", href: "mailto:support@shipin.co" },
    ],
  },
];

export const companyInfo = {
  name: "ShipIN Logistics",
  tagline: "Procurement, warehousing and freight from India, run by one team in Mumbai.",
  address: "ShipIN, 4th Floor, Trade Center, Andheri East, Mumbai 400069, India",
  hours: "Mon to Sat, 09:00 to 19:00 IST",
  email: "support@shipin.co",
  phone: "+91 22 6823 4567",
  year: 2026,
  status: "All corridors operational",
};