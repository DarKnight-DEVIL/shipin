/**
 * Landing page copy and data.
 *
 * Kept out of LandingShell so the section components can be split without
 * dragging the whole shell (and its hooks) into every chunk.
 */

export type PlanId = "standard" | "express" | "merchant";

export interface Plan {
  id: PlanId;
  code: string;
  name: string;
  price: string;
  unit: string;
  description: string;
  features: string[];
  cta: string;
  featured?: boolean;
}

export const plans: Plan[] = [
  {
    id: "standard",
    code: "Tier 01",
    name: "Standard",
    price: "$0",
    unit: "service fee per request",
    description: "For a first order or a single item you cannot get shipped.",
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
    unit: "service fee per request",
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
  {
    route: "Mumbai to Singapore",
    transit: "3 to 5 days",
    cutoff: "Mon, Wed, Fri",
  },
  { route: "Mumbai to Berlin", transit: "6 to 8 days", cutoff: "Wed, Sat" },
  { route: "Mumbai to New York", transit: "7 to 9 days", cutoff: "Tue, Thu" },
  { route: "Mumbai to Toronto", transit: "8 to 10 days", cutoff: "Thu" },
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

export interface Metric {
  value: string;
  label: string;
  detail: string;
}

/*
 * These state what the page itself can prove: the lanes it lists, their
 * published transit, and the pricing rules. They are not invented telemetry.
 */
export const metrics: Metric[] = [
  {
    value: "6",
    label: "Published corridors",
    detail: "Mumbai lanes listed below, each with its own cut-off days.",
  },
  {
    value: "3–10",
    label: "Transit, in days",
    detail: "Door to door per published lane, excluding customs holds.",
  },
  {
    value: "1",
    label: "Quote before purchase",
    detail:
      "Product, freight, service fee and duties itemised before you approve.",
  },
  {
    value: "0",
    label: "Subscriptions",
    detail: "Pay per request. Nothing recurring, nothing auto-renewed.",
  },
];

export interface Step {
  number: string;
  title: string;
  body: string;
  meta: string;
}

export const steps: Step[] = [
  {
    number: "01",
    title: "Send the link",
    body: "Paste a product URL from any Indian retailer. We confirm the seller, variant and live price before anything is charged.",
    meta: "Any Indian marketplace",
  },
  {
    number: "02",
    title: "We inspect it",
    body: "Every parcel stops at the Mumbai hub. Quantity, condition and serial numbers are checked against your order and photographed.",
    meta: "Photo QA on arrival",
  },
  {
    number: "03",
    title: "We pack as one",
    body: "Orders from different stores become a single manifest. Repacking cuts volumetric weight and one export filing covers the batch.",
    meta: "One manifest per batch",
  },
  {
    number: "04",
    title: "It moves",
    body: "Duties are quoted before dispatch, paperwork is pre-cleared, and the last mile is tracked to the address you gave us.",
    meta: "DDP on every lane",
  },
];

export interface FAQItem {
  question: string;
  answer: string;
}

export const faqs: FAQItem[] = [
  {
    question: "What can I order?",
    answer:
      "Anything sold by an Indian retailer that can be legally exported. Send the product URL. If the seller will not ship domestically, we arrange pickup from their store.",
  },
  {
    question: "How does payment work?",
    answer:
      "We quote in your billing currency and you approve once. ShipIN settles with the seller in INR, then invoices the consolidated total with freight and duties itemised line by line.",
  },
  {
    question: "Can I combine orders from different stores?",
    answer:
      "Yes. Orders that reach the hub inside the same seven day window ship as one manifest. Express includes consolidation; on Standard it is added per parcel.",
  },
  {
    question: "What happens if an item arrives damaged?",
    answer:
      "Nothing leaves the hub without a photo set. If an item is wrong or damaged on arrival, we hold the shipment, send you the images, and replace or refund it before dispatch.",
  },
  {
    question: "Do you handle customs and duties?",
    answer:
      "We file export documents from India and quote import duties before dispatch. DDP delivery is available on all corridors. If you use your own broker, choose DDU at checkout.",
  },
  {
    question: "How long does a request take?",
    answer:
      "Published lane transit is 3 to 10 days door to door; the corridor table above lists each lane, and customs holds add time on top. A quote is usually back within one business day, and inspection happens the day your parcel reaches the hub.",
  },
];
