import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/scope";
import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";

/**
 * Ensures caller is authenticated and has Admin or Manager role.
 */
async function requireUserManagementAccess() {
  const user = await getCurrentUser();
  if (!user) {
    return { errorResponse: NextResponse.json({ error: "Unauthorized: Active session required" }, { status: 401 }) };
  }
  if (user.role !== "admin" && user.role !== "manager") {
    return {
      errorResponse: NextResponse.json(
        { error: "Forbidden: Admin or Manager privileges required for user management" },
        { status: 403 }
      ),
    };
  }
  return { user };
}

/**
 * POST /api/admin/users/reset-password
 * Resets a user's password and revokes their active sessions.
 */
export async function POST(request: Request) {
  try {
    const { user, errorResponse } = await requireUserManagementAccess();
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const { id, newPassword } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }
    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters long" }, { status: 400 });
    }

    // 1. Fetch target user
    const targetUser = await prisma.userAccount.findUnique({
      where: { id },
    });

    if (!targetUser || targetUser.organizationId !== user!.organizationId) {
      return NextResponse.json({ error: "User not found in your organization" }, { status: 404 });
    }

    // 2. Permission check:
    // Admin can reset anyone's password. Manager can only reset Operator passwords.
    if (user!.role === "manager" && targetUser.role !== "OPERATOR") {
      return NextResponse.json(
        { error: "Forbidden: Managers can only reset passwords for Operator accounts" },
        { status: 403 }
      );
    }

    // 3. Hash password with Argon2id
    const passwordHash = await hashPassword(newPassword);

    // 4. Update password and revoke all active sessions in transaction
    await prisma.$transaction(async (tx) => {
      await tx.userAccount.update({
        where: { id: targetUser.id },
        data: { passwordHash },
      });

      // Revoke all sessions so the user must re-authenticate with the new password
      await tx.userSession.updateMany({
        where: { userId: targetUser.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    return NextResponse.json({
      success: true,
      message: `Password reset successfully for ${targetUser.username}. Existing sessions have been revoked.`,
    });
  } catch (error) {
    console.error("[Admin Users Reset-Password Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

