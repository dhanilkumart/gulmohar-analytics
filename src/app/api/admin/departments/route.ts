import { NextResponse } from "next/server";
import { getCurrentUser, resolveSafeWriteOutletId } from "@/lib/auth/scope";
import { prisma } from "@/lib/db/client";
import { Prisma } from "@prisma/client";

/**
 * Helper to ensure the caller is an authenticated Admin.
 * Returns the admin user or a NextResponse error.
 */
export async function requireAdminUser() {
  const user = await getCurrentUser();
  if (!user) {
    return { errorResponse: NextResponse.json({ error: "Unauthorized: Active session required" }, { status: 401 }) };
  }
  if (user.role !== "admin" && user.role !== "manager") {
    return {
      errorResponse: NextResponse.json(
        { error: "Forbidden: Admin or Manager privileges required for master data management" },
        { status: 403 }
      ),
    };
  }
  return { user };
}

/**
 * GET /api/admin/departments?outletId=<outletId>
 * List departments belonging to the admin's organization, optionally filtered by outlet.
 */
export async function GET(request: Request) {
  try {
    const { user, errorResponse } = await requireAdminUser();
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(request.url);
    const outletId = searchParams.get("outletId");

    const where: Prisma.DepartmentWhereInput = {
      outlet: {
        organizationId: user!.organizationId,
      },
    };

    if (outletId && outletId !== "all") {
      where.outletId = outletId;
    }

    const departments = await prisma.department.findMany({
      where,
      include: {
        outlet: {
          select: { id: true, code: true, name: true, city: true },
        },
        _count: {
          select: { employees: true, breakageRecords: true },
        },
      },
      orderBy: [{ outlet: { code: "asc" } }, { departmentCode: "asc" }],
    });

    return NextResponse.json({
      success: true,
      departments: departments.map((d) => ({
        id: d.id,
        outletId: d.outletId,
        outletCode: d.outlet.code,
        outletName: d.outlet.name,
        departmentCode: d.departmentCode,
        name: d.name,
        benchmarkHeadcount: d.benchmarkHeadcount,
        isActive: d.isActive,
        employeeCount: d._count.employees,
        breakageCount: d._count.breakageRecords,
      })),
    });
  } catch (error: unknown) {
    console.error("[Admin Departments GET Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/departments
 * Create a new department for an outlet belonging to the admin's organization.
 */
export async function POST(request: Request) {
  try {
    const { user, errorResponse } = await requireAdminUser();
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const { outletId, departmentCode, name, benchmarkHeadcount } = body;

    let targetOutletId: string;
    try {
      targetOutletId = await resolveSafeWriteOutletId(user!, outletId);
    } catch (err: unknown) {
      const error = err as Error;
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!departmentCode || typeof departmentCode !== "string" || !departmentCode.trim()) {
      return NextResponse.json({ error: "Department code is required" }, { status: 400 });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Department name is required" }, { status: 400 });
    }

    // Verify outlet belongs to admin's organization
    const outlet = await prisma.outlet.findFirst({
      where: { id: targetOutletId, organizationId: user!.organizationId },
    });
    if (!outlet) {
      return NextResponse.json({ error: "Invalid outlet for your organization" }, { status: 400 });
    }

    const trimmedCode = departmentCode.trim().toUpperCase();
    const trimmedName = name.trim();
    const headcount = Number(benchmarkHeadcount) || 0;

    // Check duplicate department code within this outlet
    const existing = await prisma.department.findUnique({
      where: {
        outletId_departmentCode: {
          outletId: targetOutletId,
          departmentCode: trimmedCode,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Department code '${trimmedCode}' already exists in this outlet` },
        { status: 409 }
      );
    }

    const department = await prisma.department.create({
      data: {
        outletId,
        departmentCode: trimmedCode,
        name: trimmedName,
        benchmarkHeadcount: headcount >= 0 ? headcount : 0,
        isActive: true,
      },
      include: {
        outlet: { select: { code: true, name: true } },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Department created successfully",
      department,
    }, { status: 201 });
  } catch (error: unknown) {
    console.error("[Admin Departments POST Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/departments
 * Edit department details or activate/deactivate.
 */
export async function PUT(request: Request) {
  try {
    const { user, errorResponse } = await requireAdminUser();
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const { id, name, benchmarkHeadcount, isActive } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Department ID is required" }, { status: 400 });
    }

    // Verify department belongs to admin's organization
    const existing = await prisma.department.findUnique({
      where: { id },
      include: { outlet: true },
    });

    if (!existing || existing.outlet.organizationId !== user!.organizationId) {
      return NextResponse.json({ error: "Department not found or unauthorized" }, { status: 404 });
    }

    const data: Prisma.DepartmentUpdateInput = {};
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json({ error: "Department name cannot be empty" }, { status: 400 });
      }
      data.name = name.trim();
    }
    if (benchmarkHeadcount !== undefined) {
      const hc = Number(benchmarkHeadcount);
      data.benchmarkHeadcount = !isNaN(hc) && hc >= 0 ? hc : existing.benchmarkHeadcount;
    }
    if (isActive !== undefined) {
      data.isActive = Boolean(isActive);
    }

    const updated = await prisma.department.update({
      where: { id },
      data,
      include: {
        outlet: { select: { code: true, name: true } },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Department updated successfully",
      department: updated,
    });
  } catch (error: unknown) {
    console.error("[Admin Departments PUT Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
