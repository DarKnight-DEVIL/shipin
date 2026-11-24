import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/utils/errors";
import { requireAuthWithProfile } from "@/lib/auth";
import { logRightsRequest } from "@/lib/compliance/rightsOps2";
import { grievanceBodySchema, readAndValidateBody } from "@/lib/validation";

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  const parsed = await readAndValidateBody(request, grievanceBodySchema);

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

  const { right, details } = parsed.data;

  const requestId = await logRightsRequest({
    userId: auth.profile.uid,
    right,
    details,
  });

  return NextResponse.json(
    {
      success: true,
      requestId,
      message:
        "Your request has been submitted. We will respond within 30 days.",
    },
    { status: 202 }
  );
});

export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  // Import here to avoid circular dependency
  const { getUserRightsRequests } = await import("@/lib/compliance/rightsOps2");

  const requests = await getUserRightsRequests(auth.profile.uid);

  return NextResponse.json({
    success: true,
    requests,
  });
});
