/**
 * Shared content shapes for the landing page sections.
 *
 * These live outside `app/page.tsx` so section components can be typed
 * without importing the page module (which would pull the whole route into
 * every consumer).
 */

export interface Corridor {
  route: string;
  transit: string;
  cutoff: string;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  price: string;
  unit: string;
  description: string;
  features: string[];
  cta: string;
  featured?: boolean;
}

export interface Metric {
  value: string;
  label: string;
  detail: string;
}
