import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/scope";
import { prisma } from "@/lib/db/client";
import { Prisma } from "@prisma/client";

/**
 * GET /api/admin/preparation-items
 * Lists preparation items for the administrator's organization.
 */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role !== "admin" && user.role !== "manager") {
      return NextResponse.json({ error: "Forbidden: Admin or Manager access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get("departmentId");
    const isActiveParam = searchParams.get("isActive");

    const where: Prisma.PreparationItemWhereInput = {
      organizationId: user.organizationId,
    };

    if (departmentId && departmentId !== "all") {
      where.departmentId = departmentId;
    }

    if (isActiveParam !== null && isActiveParam !== undefined && isActiveParam !== "all") {
      where.isActive = isActiveParam === "true";
    }

    const items = await prisma.preparationItem.findMany({
      where,
      include: {
        department: {
          select: { id: true, name: true, departmentCode: true },
        },
        _count: {
          select: { preparationLogs: true, wastageRecords: true },
        },
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });

    return NextResponse.json({
      success: true,
      items: items.map((item) => ({
        id: item.id,
        code: item.code,
        name: item.name,
        unit: item.unit,
        standardCost: item.standardCost !== null ? Number(item.standardCost) : null,
        departmentId: item.departmentId,
        departmentName: item.department?.name || null,
        departmentCode: item.department?.departmentCode || null,
        isActive: item.isActive,
        usageCount: item._count.preparationLogs + item._count.wastageRecords,
      })),
    });
  } catch (error) {
    console.error("[Admin Prep Items GET Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/preparation-items
 * Creates a new preparation item in the organization master.
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== "admin" && user.role !== "manager")) {
      return NextResponse.json({ error: "Forbidden: Admin or Manager access required" }, { status: 403 });
    }

    const body = await request.json();
    const { name, code, unit, standardCost, departmentId, isActive } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Item name is required" }, { status: 400 });
    }

    if (!code || typeof code !== "string" || !code.trim()) {
      return NextResponse.json({ error: "Item code is required" }, { status: 400 });
    }

    if (!unit || typeof unit !== "string" || !unit.trim()) {
      return NextResponse.json({ error: "Unit of measurement is required" }, { status: 400 });
    }

    const cleanCode = code.trim().toUpperCase();
    const cleanName = name.trim();
    const cleanUnit = unit.trim().toLowerCase();

    // Check code uniqueness within organization
    const existing = await prisma.preparationItem.findFirst({
      where: {
        organizationId: user.organizationId,
        code: cleanCode,
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Preparation item code '${cleanCode}' already exists in your organization` },
        { status: 409 }
      );
    }

    let parsedCost: Prisma.Decimal | null = null;
    if (standardCost !== undefined && standardCost !== null && standardCost !== "") {
      const num = Number(standardCost);
      if (isNaN(num) || num < 0) {
        return NextResponse.json({ error: "Standard cost must be a non-negative number" }, { status: 400 });
      }
      parsedCost = new Prisma.Decimal(num);
    }

    const created = await prisma.preparationItem.create({
      data: {
        organizationId: user.organizationId,
        departmentId: departmentId || null,
        code: cleanCode,
        name: cleanName,
        unit: cleanUnit,
        standardCost: parsedCost,
        isActive: isActive !== false,
      },
      include: {
        department: { select: { id: true, name: true, departmentCode: true } },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Preparation item created successfully",
      item: {
        id: created.id,
        code: created.code,
        name: created.name,
        unit: created.unit,
        standardCost: created.standardCost !== null ? Number(created.standardCost) : null,
        departmentId: created.departmentId,
        departmentName: created.department?.name || null,
        departmentCode: created.department?.departmentCode || null,
        isActive: created.isActive,
      },
    });
  } catch (error) {
    console.error("[Admin Prep Items POST Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/preparation-items
 * Updates an existing preparation item.
 */
export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== "admin" && user.role !== "manager")) {
      return NextResponse.json({ error: "Forbidden: Admin or Manager access required" }, { status: 403 });
    }

    const body = await request.json();
    const { id, name, code, unit, standardCost, departmentId, isActive } = body;

    if (!id) {
      return NextResponse.json({ error: "Item ID is required" }, { status: 400 });
    }

    const existing = await prisma.preparationItem.findFirst({
      where: { id, organizationId: user.organizationId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Preparation item not found" }, { status: 404 });
    }

    const updateData: Prisma.PreparationItemUpdateInput = {};

    if (name !== undefined) {
      if (!name || typeof name !== "string" || !name.trim()) {
        return NextResponse.json({ error: "Item name cannot be empty" }, { status: 400 });
      }
      updateData.name = name.trim();
    }

    if (code !== undefined) {
      if (!code || typeof code !== "string" || !code.trim()) {
        return NextResponse.json({ error: "Item code cannot be empty" }, { status: 400 });
      }
      const cleanCode = code.trim().toUpperCase();
      if (cleanCode !== existing.code) {
        const duplicate = await prisma.preparationItem.findFirst({
          where: {
            organizationId: user.organizationId,
            code: cleanCode,
            id: { not: id },
          },
        });
        if (duplicate) {
          return NextResponse.json({ error: `Item code '${cleanCode}' is already in use` }, { status: 409 });
        }
        updateData.code = cleanCode;
      }
    }

    if (unit !== undefined) {
      if (!unit || typeof unit !== "string" || !unit.trim()) {
        return NextResponse.json({ error: "Unit cannot be empty" }, { status: 400 });
      }
      updateData.unit = unit.trim().toLowerCase();
    }

    if (standardCost !== undefined) {
      if (standardCost === null || standardCost === "") {
        updateData.standardCost = null;
      } else {
        const num = Number(standardCost);
        if (isNaN(num) || num < 0) {
          return NextResponse.json({ error: "Standard cost must be non-negative" }, { status: 400 });
        }
        updateData.standardCost = new Prisma.Decimal(num);
      }
    }

    if (departmentId !== undefined) {
      if (departmentId) {
        updateData.department = { connect: { id: departmentId } };
      } else {
        updateData.department = { disconnect: true };
      }
    }

    if (isActive !== undefined) {
      updateData.isActive = Boolean(isActive);
    }

    const updated = await prisma.preparationItem.update({
      where: { id },
      data: updateData,
      include: {
        department: { select: { id: true, name: true, departmentCode: true } },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Preparation item updated successfully",
      item: {
        id: updated.id,
        code: updated.code,
        name: updated.name,
        unit: updated.unit,
        standardCost: updated.standardCost !== null ? Number(updated.standardCost) : null,
        departmentId: updated.departmentId,
        departmentName: updated.department?.name || null,
        departmentCode: updated.department?.departmentCode || null,
        isActive: updated.isActive,
      },
    });
  } catch (error) {
    console.error("[Admin Prep Items PUT Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

