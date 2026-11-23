import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/scope";
import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { AppRole, Prisma } from "@prisma/client";

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
 * GET /api/admin/users
 * Lists users belonging to the caller's organization.
 */
export async function GET(request: Request) {
  try {
    const { user, errorResponse } = await requireUserManagementAccess();
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();
    const roleParam = searchParams.get("role")?.trim().toUpperCase();
    const statusParam = searchParams.get("status")?.trim();

    const where: Prisma.UserAccountWhereInput = {
      organizationId: user!.organizationId,
    };

    if (roleParam && roleParam !== "ALL") {
      if (roleParam in AppRole) {
        where.role = roleParam as AppRole;
      }
    }

    if (statusParam && statusParam !== "ALL") {
      where.isActive = statusParam === "ACTIVE";
    }

    if (search) {
      where.OR = [
        { displayName: { contains: search, mode: "insensitive" } },
        { username: { contains: search, mode: "insensitive" } },
      ];
    }

    const [users, outlets] = await Promise.all([
      prisma.userAccount.findMany({
        where,
        select: {
          id: true,
          username: true,
          displayName: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          outletAssignments: {
            select: {
              id: true,
              outletId: true,
              isDefault: true,
              outlet: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  city: true,
                },
              },
            },
            orderBy: [{ isDefault: "desc" }, { outlet: { code: "asc" } }],
          },
        },
        orderBy: [{ role: "asc" }, { createdAt: "desc" }],
      }),
      prisma.outlet.findMany({
        where: { organizationId: user!.organizationId, isActive: true },
        select: { id: true, code: true, name: true, city: true },
        orderBy: { code: "asc" },
      }),
    ]);

    const formattedUsers = users.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
      outletAssignments: u.outletAssignments.map((oa) => ({
        outletId: oa.outletId,
        code: oa.outlet.code,
        name: oa.outlet.name,
        city: oa.outlet.city,
        isDefault: oa.isDefault,
      })),
    }));

    return NextResponse.json({
      success: true,
      currentUserRole: user!.role,
      users: formattedUsers,
      availableOutlets: outlets,
    });
  } catch (error) {
    console.error("[Admin Users GET Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/users
 * Creates a new user in the organization.
 */
export async function POST(request: Request) {
  try {
    const { user, errorResponse } = await requireUserManagementAccess();
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const {
      username,
      displayName,
      password,
      role,
      assignedOutletIds,
      defaultOutletId,
    } = body;

    // 1. Basic validation
    if (!username || typeof username !== "string" || !username.trim()) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }
    if (!displayName || typeof displayName !== "string" || !displayName.trim()) {
      return NextResponse.json({ error: "Display name is required" }, { status: 400 });
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters long" }, { status: 400 });
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanDisplayName = displayName.trim();
    const targetRole = String(role || "").toUpperCase();

    if (!(targetRole in AppRole)) {
      return NextResponse.json({ error: "Valid role (ADMIN, MANAGER, or OPERATOR) is required" }, { status: 400 });
    }

    // 2. Role authorization rules:
    // Manager cannot create Admin accounts or Manager accounts (Manager can only manage Operators)
    if (user!.role === "manager" && targetRole !== "OPERATOR") {
      return NextResponse.json(
        { error: "Forbidden: Managers are only authorized to create and manage Operator accounts" },
        { status: 403 }
      );
    }

    // 3. Check username uniqueness
    const existingUser = await prisma.userAccount.findUnique({
      where: { username: cleanUsername },
    });
    if (existingUser) {
      return NextResponse.json({ error: `Username '${cleanUsername}' is already taken` }, { status: 409 });
    }

    // 4. Validate outlet assignments
    const outletIds: string[] = Array.isArray(assignedOutletIds) ? assignedOutletIds : [];

    // Operators MUST have at least one valid outlet assignment
    if (targetRole === "OPERATOR" && outletIds.length === 0) {
      return NextResponse.json(
        { error: "Operator accounts must be assigned to at least one outlet" },
        { status: 400 }
      );
    }

    if (outletIds.length > 0) {
      // Verify all outlets belong to caller's organization and are active
      const validOutlets = await prisma.outlet.findMany({
        where: {
          id: { in: outletIds },
          organizationId: user!.organizationId,
          isActive: true,
        },
        select: { id: true },
      });

      if (validOutlets.length !== outletIds.length) {
        return NextResponse.json(
          { error: "One or more assigned outlets are invalid or do not belong to your organization" },
          { status: 400 }
        );
      }
    }

    // Determine default outlet
    let resolvedDefaultOutletId = defaultOutletId;
    if (outletIds.length > 0) {
      if (!resolvedDefaultOutletId || !outletIds.includes(resolvedDefaultOutletId)) {
        resolvedDefaultOutletId = outletIds[0];
      }
    } else {
      resolvedDefaultOutletId = null;
    }

    // 5. Hash password with Argon2id
    const passwordHash = await hashPassword(password);

    // 6. Create in transaction
    const newUser = await prisma.$transaction(async (tx) => {
      const created = await tx.userAccount.create({
        data: {
          organizationId: user!.organizationId,
          username: cleanUsername,
          displayName: cleanDisplayName,
          passwordHash,
          role: targetRole as AppRole,
          isActive: true,
        },
      });

      if (outletIds.length > 0) {
        await tx.userOutletAssignment.createMany({
          data: outletIds.map((oId) => ({
            userId: created.id,
            outletId: oId,
            isDefault: oId === resolvedDefaultOutletId,
          })),
        });
      }

      return created;
    });

    return NextResponse.json(
      {
        success: true,
        message: "User created successfully",
        user: {
          id: newUser.id,
          username: newUser.username,
          displayName: newUser.displayName,
          role: newUser.role,
          isActive: newUser.isActive,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Admin Users POST Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/users
 * Updates an existing user's details, role, and outlet assignments.
 */
export async function PUT(request: Request) {
  try {
    const { user, errorResponse } = await requireUserManagementAccess();
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const {
      id,
      username,
      displayName,
      role,
      assignedOutletIds,
      defaultOutletId,
    } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    // 1. Fetch target user
    const targetUser = await prisma.userAccount.findUnique({
      where: { id },
      include: { outletAssignments: true },
    });

    if (!targetUser || targetUser.organizationId !== user!.organizationId) {
      return NextResponse.json({ error: "User not found in your organization" }, { status: 404 });
    }

    // 2. Permission checks:
    // Manager cannot modify Admin or other Manager accounts
    if (user!.role === "manager" && targetUser.role !== "OPERATOR") {
      return NextResponse.json(
        { error: "Forbidden: Managers can only manage Operator accounts" },
        { status: 403 }
      );
    }

    const nextRole = role ? String(role).toUpperCase() : targetUser.role;
    if (!(nextRole in AppRole)) {
      return NextResponse.json({ error: "Invalid role specified" }, { status: 400 });
    }

    // Manager cannot promote anyone to Admin or Manager
    if (user!.role === "manager" && nextRole !== "OPERATOR") {
      return NextResponse.json(
        { error: "Forbidden: Managers cannot promote accounts to Admin or Manager" },
        { status: 403 }
      );
    }

    // Check preventing demoting the last active Admin
    if (targetUser.role === "ADMIN" && nextRole !== "ADMIN") {
      const activeAdminCount = await prisma.userAccount.count({
        where: {
          organizationId: user!.organizationId,
          role: "ADMIN",
          isActive: true,
        },
      });
      if (activeAdminCount <= 1) {
        return NextResponse.json(
          { error: "Cannot change role: Organization must have at least one active Admin account" },
          { status: 400 }
        );
      }
    }

    // Check username uniqueness if changed
    const cleanUsername = username ? username.trim().toLowerCase() : targetUser.username;
    if (cleanUsername !== targetUser.username) {
      const existing = await prisma.userAccount.findUnique({
        where: { username: cleanUsername },
      });
      if (existing && existing.id !== targetUser.id) {
        return NextResponse.json({ error: `Username '${cleanUsername}' is already taken` }, { status: 409 });
      }
    }

    const cleanDisplayName = displayName ? displayName.trim() : targetUser.displayName;

    // Validate outlet assignments
    let outletIds: string[] | undefined = undefined;
    if (Array.isArray(assignedOutletIds)) {
      outletIds = assignedOutletIds;
      if (nextRole === "OPERATOR" && outletIds.length === 0) {
        return NextResponse.json(
          { error: "Operator accounts must have at least one assigned outlet" },
          { status: 400 }
        );
      }

      if (outletIds.length > 0) {
        const validOutlets = await prisma.outlet.findMany({
          where: {
            id: { in: outletIds },
            organizationId: user!.organizationId,
            isActive: true,
          },
          select: { id: true },
        });

        if (validOutlets.length !== outletIds.length) {
          return NextResponse.json(
            { error: "One or more assigned outlets are invalid for your organization" },
            { status: 400 }
          );
        }
      }
    }

    let resolvedDefaultOutletId = defaultOutletId;
    if (outletIds && outletIds.length > 0) {
      if (!resolvedDefaultOutletId || !outletIds.includes(resolvedDefaultOutletId)) {
        resolvedDefaultOutletId = outletIds[0];
      }
    } else if (outletIds) {
      resolvedDefaultOutletId = null;
    }

    // Check if outlet assignments actually changed
    const currentOutletIds = targetUser.outletAssignments.map((a) => a.outletId).sort();
    const currentDefault = targetUser.outletAssignments.find((a) => a.isDefault)?.outletId ?? null;
    const nextOutletIds = outletIds ? [...outletIds].sort() : undefined;
    const outletAssignmentsChanged =
      nextOutletIds !== undefined &&
      (currentOutletIds.length !== nextOutletIds.length ||
        currentOutletIds.some((id, idx) => id !== nextOutletIds[idx]) ||
        currentDefault !== resolvedDefaultOutletId);

    // Execute update in transaction
    await prisma.$transaction(async (tx) => {
      await tx.userAccount.update({
        where: { id: targetUser.id },
        data: {
          username: cleanUsername,
          displayName: cleanDisplayName,
          role: nextRole as AppRole,
        },
      });

      if (outletAssignmentsChanged && outletIds !== undefined) {
        await tx.userOutletAssignment.deleteMany({
          where: { userId: targetUser.id },
        });

        if (outletIds.length > 0) {
          await tx.userOutletAssignment.createMany({
            data: outletIds.map((oId) => ({
              userId: targetUser.id,
              outletId: oId,
              isDefault: oId === resolvedDefaultOutletId,
            })),
          });
        }
      }

      // Only revoke sessions if role or outlet assignments ACTUALLY changed.
      // Changing display name or username should not log the user out!
      if (targetUser.role !== nextRole || outletAssignmentsChanged) {
        await tx.userSession.updateMany({
          where: { userId: targetUser.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    });

    return NextResponse.json({
      success: true,
      message: "User updated successfully",
    });
  } catch (error) {
    console.error("[Admin Users PUT Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

