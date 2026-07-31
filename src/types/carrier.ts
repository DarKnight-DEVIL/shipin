export const CARRIERS = [
  "India Post",
  "DHL",
  "FedEx",
  "UPS",
  "Blue Dart",
  "DTDC",
  "Delhivery",
  "Aramex",
] as const;

export type Carrier = typeof CARRIERS[number];