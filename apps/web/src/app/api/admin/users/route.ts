import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { getAdminAuthError, requireAdmin } from "@/lib/adminAuth";
import {
  InvalidAdminPageParamError,
  parseAdminPageParams,
  toAdminPage,
} from "@/lib/adminPagination";
import { childLogger } from "../../../../lib/logger";
import { adminUserRoleBodySchema, readAndValidateBody } from "@/lib/validation";

const NO_STORE = { "Cache-Control": "no-store" } as const;

type AssignableRole = "admin" | "customer";

const ROLES: AssignableRole[] = ["admin", "customer"];

export interface AdminUserRow {
  uid: string;
  email: string;
  displayName: string;
  role: AssignableRole;
  mfaEnabled: boolean;
  createdAt: number | null;
}

function readRole(value: unknown): AssignableRole {
  return value === "admin" ? "admin" : "customer";
}

function mfaSummary(mfa: unknown): boolean {
  const record = (mfa ?? {}) as Record<string, unknown>;
  const totp = record.totp as { enabled?: boolean } | undefined;
  const sms = record.sms as { enabled?: boolean } | undefined;
  const webauthn = record.webauthn as { enabled?: boolean } | undefined;

  return Boolean(totp?.enabled || sms?.enabled || webauthn?.enabled);
}

/**
 * GET /api/admin/users
 *
 * List accounts with their role so an administrator can see who holds admin
 * rights, newest first, in `?limit`/`?cursor` pages. Never returns secrets,
 * MFA secrets, or tokens.
 */
async function handleGet(request: NextRequest): Promise<NextResponse> {
  await requireAdmin(request);

  const url = new URL(request.url);

  let params;
  try {
    params = parseAdminPageParams(url);
  } catch (error) {
    if (error instanceof InvalidAdminPageParamError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid limit or cursor.",
          code: error.code,
        },
        { status: 400, headers: NO_STORE }
      );
    }
    throw error;
  }

  let query = adminDb
    .collection("users")
    .orderBy("createdAt", "desc")
    .limit(params.limit);

  if (params.cursorMs !== null) {
    query = query.startAfter(Timestamp.fromMillis(params.cursorMs));
  }

  const snapshot = await query.get();

  const page = toAdminPage(snapshot.docs, params.limit, (doc) => {
    const data = doc.data() as Record<string, unknown>;
    const createdAt = data.createdAt as { toMillis?: () => number } | undefined;

    return {
      uid: doc.id,
      email: typeof data.email === "string" ? data.email : "",
      displayName: typeof data.displayName === "string" ? data.displayName : "",
      role: readRole(data.role),
      mfaEnabled: mfaSummary(data.mfa),
      createdAt:
        typeof createdAt?.toMillis === "function" ? createdAt.toMillis() : null,
    };
  });

  return NextResponse.json(
    {
      success: true,
      users: page.items,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    },
    { status: 200, headers: NO_STORE }
  );
}

/**
 * PATCH /api/admin/users
 *
 * Change an account's role. Two invariants are enforced here rather than in
 * the UI: an administrator cannot change their own role (that is how people
 * lock themselves out), and the last remaining administrator cannot be
 * demoted (that is how everyone loses admin access).
 */
async function handlePatch(request: NextRequest): Promise<NextResponse> {
  const admin = await requireAdmin(request);

  const parsed = await readAndValidateBody(request, adminUserRoleBodySchema);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request body.",
        code: "INVALID_REQUEST_BODY",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  const { uid, role } = parsed.data;

  if (uid === admin.uid) {
    return NextResponse.json(
      {
        success: false,
        error: "You cannot change your own role.",
        code: "CANNOT_CHANGE_OWN_ROLE",
      },
      { status: 409, headers: NO_STORE }
    );
  }

  const targetRef = adminDb.collection("users").doc(uid);
  const target = await targetRef.get();

  if (!target.exists) {
    return NextResponse.json(
      {
        success: false,
        error: "User not found.",
        code: "USER_PROFILE_NOT_FOUND",
      },
      { status: 404, headers: NO_STORE }
    );
  }

  const currentRole = readRole(target.data()?.role);
  const nextRole = role as AssignableRole;

  if (currentRole === "admin" && nextRole !== "admin") {
    const admins = await adminDb
      .collection("users")
      .where("role", "==", "admin")
      .get();

    if (admins.size <= 1) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This is the last administrator. Promote another account first.",
          code: "LAST_ADMIN",
        },
        { status: 409, headers: NO_STORE }
      );
    }
  }

  await targetRef.update({ role: nextRole });

  const adminLogger = childLogger({ service: "admin-users" });
  adminLogger.warn(
    `AdminUsers: ${admin.email ?? admin.uid} set role of ${uid} to ${nextRole}`
  );

  return NextResponse.json(
    { success: true, uid, role: nextRole },
    { status: 200, headers: NO_STORE }
  );
}

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  try {
    return await handleGet(request);
  } catch (error) {
    const authError = getAdminAuthError(error);

    if (authError.status !== 500) {
      return NextResponse.json(
        { success: false, error: authError.error },
        { status: authError.status, headers: NO_STORE }
      );
    }

    console.error("[AdminUsers] Unexpected GET error:", error);

    return NextResponse.json(
      { success: false, error: "Unable to load users." },
      { status: 500, headers: NO_STORE }
    );
  }
};

export const PATCH = async (request: NextRequest): Promise<NextResponse> => {
  try {
    return await handlePatch(request);
  } catch (error) {
    const authError = getAdminAuthError(error);

    if (authError.status !== 500) {
      return NextResponse.json(
        { success: false, error: authError.error },
        { status: authError.status, headers: NO_STORE }
      );
    }

    console.error("[AdminUsers] Unexpected PATCH error:", error);

    return NextResponse.json(
      { success: false, error: "Unable to update that user." },
      { status: 500, headers: NO_STORE }
    );
  }
};
