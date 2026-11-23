import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/scope";
import { prisma } from "@/lib/db/client";

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
 * PATCH /api/admin/users/status
 * Activates or deactivates a user account.
 */
export async function PATCH(request: Request) {
  try {
    const { user, errorResponse } = await requireUserManagementAccess();
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const { id, isActive } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }
    if (typeof isActive !== "boolean") {
      return NextResponse.json({ error: "isActive status boolean is required" }, { status: 400 });
    }

    // 1. Fetch target user
    const targetUser = await prisma.userAccount.findUnique({
      where: { id },
    });

    if (!targetUser || targetUser.organizationId !== user!.organizationId) {
      return NextResponse.json({ error: "User not found in your organization" }, { status: 404 });
    }

    // 2. Prevent self-deactivation
    if (targetUser.id === user!.id && !isActive) {
      return NextResponse.json({ error: "Cannot deactivate your own account" }, { status: 400 });
    }

    // 3. Manager can only activate/deactivate Operator accounts
    if (user!.role === "manager" && targetUser.role !== "OPERATOR") {
      return NextResponse.json(
        { error: "Forbidden: Managers can only manage status for Operator accounts" },
        { status: 403 }
      );
    }

    // 4. Prevent deactivating the last active Admin account
    if (targetUser.role === "ADMIN" && !isActive) {
      const activeAdminCount = await prisma.userAccount.count({
        where: {
          organizationId: user!.organizationId,
          role: "ADMIN",
          isActive: true,
        },
      });
      if (activeAdminCount <= 1) {
        return NextResponse.json(
          { error: "Cannot deactivate: Organization must have at least one active Admin account" },
          { status: 400 }
        );
      }
    }

    // 5. Update status and revoke sessions in transaction if deactivating
    await prisma.$transaction(async (tx) => {
      await tx.userAccount.update({
        where: { id: targetUser.id },
        data: { isActive },
      });

      if (!isActive) {
        // Immediate session revocation
        await tx.userSession.updateMany({
          where: { userId: targetUser.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    });

    return NextResponse.json({
      success: true,
      message: `User account ${isActive ? "activated" : "deactivated"} successfully`,
    });
  } catch (error) {
    console.error("[Admin Users Status PATCH Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

