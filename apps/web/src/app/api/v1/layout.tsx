/**
 * API v1 segment layout.
 *
 * Route handlers live in their own `route.ts` files; this segment only sets
 * the runtime behaviour for everything under /api/v1, so the layout just
 * renders its children unchanged.
 */
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export default function ApiV1Layout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
