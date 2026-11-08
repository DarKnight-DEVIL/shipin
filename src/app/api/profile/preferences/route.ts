import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

import { requireAuthWithProfile } from '@/lib/auth';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  MIN_DASHBOARD_METRICS,
  dashboardMetrics,
  type DashboardMetricId,
} from '@/features/users/services/dashboardMetrics';
import { ValidationError, withErrorHandler } from '@/utils/errors';

const metricIds = dashboardMetrics.map((metric) => metric.id) as [
  DashboardMetricId,
  ...DashboardMetricId[],
];

const dashboardPreferencesSchema = z.object({
  metrics: z
    .array(z.enum(metricIds))
    .min(MIN_DASHBOARD_METRICS, `Select at least ${MIN_DASHBOARD_METRICS} dashboard cards.`)
    .max(metricIds.length),
});

/**
 * PATCH /api/profile/preferences
 *
 * Saves which cards the signed-in user wants on their dashboard.
 */
export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new ValidationError('Invalid request body.');
  }

  const validated = dashboardPreferencesSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError(
      validated.error.issues[0]?.message ?? 'Invalid dashboard preferences.',
      validated.error.issues
    );
  }

  await adminDb
    .collection('users')
    .doc(auth.profile.uid)
    .set(
      {
        preferences: {
          dashboardMetrics: validated.data.metrics,
        },
        preferencesUpdatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  return NextResponse.json(
    { success: true },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
});
