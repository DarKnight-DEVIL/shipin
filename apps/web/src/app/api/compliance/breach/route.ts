import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/utils/errors";
import { requireAdmin } from "@/lib/auth";
import {
  recordBreach,
  updateBreach,
  getAllBreaches,
} from "@/lib/compliance/breach";
import {
  breachRecordBodySchema,
  breachUpdateBodySchema,
  readAndValidateBody,
} from "@/lib/validation";

export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const breaches = await getAllBreaches(undefined, 100);

  return NextResponse.json({
    success: true,
    breaches,
  });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const parsed = await readAndValidateBody(request, breachRecordBodySchema);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error:
          parsed.reason === "parse"
            ? "Invalid JSON body."
            : "Invalid request body.",
        code: "VALIDATION_ERROR",
      },
      { status: 400 }
    );
  }

  const {
    severity,
    description,
    affectedCategories,
    estimatedAffectedUsers,
    discoveredAt,
    containedAt,
    rootCause,
    remediationSteps,
    reportedToBoard,
    reportedToUsers,
  } = parsed.data;

  const breachId = await recordBreach({
    severity,
    description,
    affectedCategories,
    estimatedAffectedUsers,
    discoveredAt: new Date(discoveredAt),
    containedAt: containedAt ? new Date(containedAt) : undefined,
    rootCause,
    remediationSteps,
    reportedToBoard: reportedToBoard === true,
    reportedToUsers: reportedToUsers === true,
  });

  return NextResponse.json(
    {
      success: true,
      breachId,
      message:
        "Breach recorded. Remember: 72-hour notification to Data Protection Board required for high/critical breaches.",
    },
    { status: 201 }
  );
});

export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const parsed = await readAndValidateBody(request, breachUpdateBodySchema);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error:
          parsed.reason === "parse"
            ? "Invalid JSON body."
            : "Invalid request body.",
        code: "VALIDATION_ERROR",
      },
      { status: 400 }
    );
  }

  const {
    breachId,
    containedAt,
    rootCause,
    remediationSteps,
    reportedToBoard,
    reportedToUsers,
    status,
  } = parsed.data;

  const updates: Partial<{
    containedAt: Date;
    rootCause: string;
    remediationSteps: string[];
    reportedToBoard: boolean;
    reportedToUsers: boolean;
    status: "open" | "contained" | "resolved" | "closed";
  }> = {};

  if (containedAt) updates.containedAt = new Date(containedAt);
  if (rootCause) updates.rootCause = rootCause;
  if (remediationSteps) updates.remediationSteps = remediationSteps;
  if (reportedToBoard !== undefined) updates.reportedToBoard = reportedToBoard;
  if (reportedToUsers !== undefined) updates.reportedToUsers = reportedToUsers;
  if (status) {
    updates.status = status;
  }

  await updateBreach(breachId, updates);

  return NextResponse.json({
    success: true,
    message: "Breach record updated",
  });
});
