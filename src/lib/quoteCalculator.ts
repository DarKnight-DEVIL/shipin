import type { ServiceSelections } from "@/types/request";

export function calculateServiceFeeFromConfig(
  services?: ServiceSelections
) {
  if (!services) {
    return 0;
  }

  let total = 0;

  if (services.inspection === "detailed") {
    total += 5;
  }

  if (services.shippingPreference === "hold") {
    total += 5;
  }

  return total;
}