/**
 * The pricing bands shown on the landing page.
 *
 * Derived from the code that charges and stores, not typed in: the page used to
 * advertise a $9 Express tier and "30 days of free warehousing" that nothing
 * implemented — `calculateServiceFee` has no tier input, and
 * `warehousePolicy` frees 3, 7 or 14 days depending on the shipping
 * preference. A customer could click "Select Express", reach checkout, and be
 * charged by a completely different rule.
 *
 * Everything here is therefore computed from `PRICING` and
 * `warehousePolicy`, and `serviceBands.test.ts` fails if the copy stops
 * matching them.
 */

import { PRICING } from "@/config/pricing";
import {
  getStorageParams,
  STORAGE_DAILY_FINE_USD,
} from "@/features/requests/services/warehousePolicy";

export type ServiceBandId = "free" | "flat" | "percentage";

export interface ServiceBand {
  id: ServiceBandId;
  /** The order-value range this band applies to, as shown above the title. */
  code: string;
  name: string;
  price: string;
  unit: string;
  description: string;
  features: string[];
  cta: string;
  featured?: boolean;
}

/** Free storage days for each shipping preference, in page order. */
const freeStorageDays = ["auto", "approval", "hold"].map(
  (preference) => getStorageParams(preference).freeStorageDays
);

/** `$5`, `$523.33`, `$0` — no trailing `.00`. */
export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export const SERVICE_BANDS: ServiceBand[] = [
  {
    id: "free",
    code: `Up to ${formatUsd(PRICING.FREE_SERVICE_LIMIT)}`,
    name: "Free",
    price: formatUsd(0),
    unit: "service fee",
    description: `Orders whose products total ${formatUsd(
      PRICING.FREE_SERVICE_LIMIT
    )} or less.`,
    features: [
      "Standard inspection at the hub",
      "Photos before dispatch on request",
      `Free storage for ${freeStorageDays[0]} to ${freeStorageDays[2]} days`,
    ],
    cta: "Start a request",
  },
  {
    id: "flat",
    code: `Up to ${formatUsd(PRICING.FLAT_FEE_LIMIT)}`,
    name: "Flat fee",
    price: formatUsd(PRICING.FLAT_FEE),
    unit: "service fee",
    description: `Orders whose products total ${formatUsd(
      PRICING.FREE_SERVICE_LIMIT
    )} to ${formatUsd(PRICING.FLAT_FEE_LIMIT)}.`,
    features: [
      "One fee whatever the item count",
      `Detailed inspection for ${formatUsd(PRICING.inspection.detailed.price)}`,
      "Freight and duties itemised separately",
    ],
    cta: "Start a request",
  },
  {
    id: "percentage",
    code: `${formatUsd(PRICING.FREE_SERVICE_LIMIT)} to ${formatUsd(
      PRICING.PERCENTAGE_LIMIT
    )}`,
    name: `${PRICING.PERCENTAGE * 100}% of products`,
    price: `${PRICING.PERCENTAGE * 100}%`,
    unit: `service fee, ${formatUsd(PRICING.MIN_PERCENTAGE_FEE)} minimum`,
    description: "Most orders land here: the fee scales with what you buy.",
    features: [
      "Charged on product value only",
      `Hold packages for ${freeStorageDays[2]} days free`,
      `Then ${formatUsd(STORAGE_DAILY_FINE_USD)} per day`,
    ],
    cta: "Start a request",
    featured: true,
  },
];
