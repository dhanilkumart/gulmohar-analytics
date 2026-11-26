import { resolveRestaurantContext, assertRestaurantRecord, validateRestaurantDepartment } from "@/lib/context/restaurant-context";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/scope";
import { prisma } from "@/lib/db/client";
import { Prisma } from "@prisma/client";

/**
 * GET /api/dashboard/preparation
 * Reads preparation logs from PostgreSQL with filtering by date range and preparation item.
 */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role === "operator") {
      return NextResponse.json({ error: "Forbidden: Operator lacks management dashboard access" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const itemIdParam = searchParams.get("itemId");

    const context = await resolveRestaurantContext(user);

    const where: Prisma.PreparationLogWhereInput = {};

    where.outletId = context.outletId;

    if (startDateParam || endDateParam) {
      where.date = {};
      if (startDateParam) where.date.gte = new Date(startDateParam);
      if (endDateParam) where.date.lte = new Date(endDateParam);
    }

    if (itemIdParam && itemIdParam !== "all") {
      where.preparationItemId = itemIdParam;
    }

    const records = await prisma.preparationLog.findMany({
      where,
      include: {
        preparationItem: {
          select: { id: true, name: true, code: true, unit: true, standardCost: true },
        },
        outlet: { select: { id: true, code: true, name: true } },
        department: { select: { id: true, name: true, departmentCode: true } },
        recordedBy: { select: { id: true, username: true, displayName: true } },
      },
      orderBy: { date: "desc" },
    });

    const mapped = records.map((r) => ({
      id: r.id,
      date: r.date.toISOString().split("T")[0],
      itemId: r.preparationItemId,
      itemName: r.preparationItem.name,
      itemCode: r.preparationItem.code,
      unit: r.preparationItem.unit,
      quantity: Number(r.quantity),
      standardCost: r.preparationItem.standardCost !== null ? Number(r.preparationItem.standardCost) : null,
      notes: r.notes || "",
      outletId: r.outletId,
      outletCode: r.outlet.code,
      departmentId: r.departmentId,
      departmentName: r.department?.name || null,
      recordedBy: r.recordedBy.displayName,
    }));

    return NextResponse.json({
      success: true,
      outletScope: {
        targetOutletId: context.outletId,
        isConsolidated: false,
      },
      records: mapped,
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message?.startsWith("CONFIGURATION")) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    if (err.message?.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("[Dashboard Prep GET Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/dashboard/preparation
 * Creates a preparation log entry for an outlet.
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role === "operator") {
      return NextResponse.json({ error: "Forbidden: Operators must use floor entry" }, { status: 403 });
    }

    const body = await request.json();
    const { itemId, date, quantity, departmentId, notes } = body;

    const context = await resolveRestaurantContext(user);
    const targetOutletId = context.outletId;

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      return NextResponse.json({ error: "Quantity must be a positive number greater than 0" }, { status: 400 });
    }

    if (!itemId) {
      return NextResponse.json({ error: "Preparation item is required" }, { status: 400 });
    }

    // Verify preparation item
    const prepItem = await prisma.preparationItem.findFirst({
      where: { id: itemId, organizationId: user.organizationId, isActive: true },
    });

    if (!prepItem) {
      return NextResponse.json({ error: "Active preparation item not found" }, { status: 404 });
    }

    const entryDate = date ? new Date(date) : new Date();

    await validateRestaurantDepartment(context, departmentId || prepItem.departmentId || null);

    const newLog = await prisma.preparationLog.create({
      data: {
        outletId: targetOutletId,
        preparationItemId: prepItem.id,
        departmentId: departmentId || prepItem.departmentId || null,
        recordedById: user.id,
        date: entryDate,
        quantity: new Prisma.Decimal(qty),
        notes: notes ? String(notes).trim() : null,
      },
      include: {
        preparationItem: { select: { name: true, code: true, unit: true } },
        outlet: { select: { code: true } },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Preparation logged successfully",
      record: {
        id: newLog.id,
        date: newLog.date.toISOString().split("T")[0],
        itemId: newLog.preparationItemId,
        itemName: newLog.preparationItem.name,
        itemCode: newLog.preparationItem.code,
        unit: newLog.preparationItem.unit,
        quantity: Number(newLog.quantity),
        notes: newLog.notes || "",
        outletCode: newLog.outlet.code,
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message?.startsWith("CONFIGURATION")) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    if (err.message?.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("[Dashboard Prep POST Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PUT /api/dashboard/preparation
 * Updates an existing preparation log entry.
 */
export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role === "operator") {
      return NextResponse.json({ error: "Forbidden: Operators cannot edit records" }, { status: 403 });
    }

    const body = await request.json();
    const { id, quantity, departmentId, notes } = body;

    if (!id) {
      return NextResponse.json({ error: "Log ID is required" }, { status: 400 });
    }

    const existing = await prisma.preparationLog.findUnique({
      where: { id },
      include: { outlet: true, preparationItem: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Preparation record not found" }, { status: 404 });
    }

    // Check outlet authorization
    const context = await resolveRestaurantContext(user);
    assertRestaurantRecord(context, existing);

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      return NextResponse.json({ error: "Quantity must be a positive number greater than 0" }, { status: 400 });
    }

    // Concurrency / business integrity check: Ensure reducing prep quantity does not cause
    // total wasted quantity for this item/outlet/date to exceed total prepared quantity.
    const wastageSum = await prisma.wastageRecord.aggregate({
      where: {
        outletId: existing.outletId,
        preparationItemId: existing.preparationItemId,
        date: existing.date,
      },
      _sum: { wastedQuantity: true },
    });

    const otherPrepSum = await prisma.preparationLog.aggregate({
      where: {
        outletId: existing.outletId,
        preparationItemId: existing.preparationItemId,
        date: existing.date,
        id: { not: existing.id },
      },
      _sum: { quantity: true },
    });

    const totalWasted = Number(wastageSum._sum.wastedQuantity || 0);
    const newTotalPrepared = Number(otherPrepSum._sum.quantity || 0) + qty;

    if (newTotalPrepared < totalWasted) {
      return NextResponse.json(
        {
          error: `Cannot reduce prepared quantity to ${qty}. Existing wastage of ${totalWasted} ${existing.preparationItem.unit} would exceed available preparation.`,
        },
        { status: 400 }
      );
    }

    await validateRestaurantDepartment(context, departmentId || null);

    const updated = await prisma.preparationLog.update({
      where: { id },
      data: {
        quantity: new Prisma.Decimal(qty),
        departmentId: departmentId || null,
        notes: notes ? String(notes).trim() : null,
      },
      include: {
        preparationItem: { select: { name: true, code: true, unit: true } },
        outlet: { select: { code: true } },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Preparation record updated successfully",
      record: {
        id: updated.id,
        date: updated.date.toISOString().split("T")[0],
        itemId: updated.preparationItemId,
        itemName: updated.preparationItem.name,
        itemCode: updated.preparationItem.code,
        unit: updated.preparationItem.unit,
        quantity: Number(updated.quantity),
        notes: updated.notes || "",
        outletCode: updated.outlet.code,
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message?.startsWith("CONFIGURATION")) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    if (err.message?.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("[Dashboard Prep PUT Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * DELETE /api/dashboard/preparation
 * Deletes a preparation log entry.
 */
export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role === "operator") {
      return NextResponse.json({ error: "Forbidden: Operators cannot delete records" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Record ID is required" }, { status: 400 });
    }

    const existing = await prisma.preparationLog.findUnique({
      where: { id },
      include: { outlet: true, preparationItem: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Preparation record not found" }, { status: 404 });
    }

    const context = await resolveRestaurantContext(user);
    assertRestaurantRecord(context, existing);

    // Safety check: ensure deleting this prep log doesn't leave total prepared < total wasted
    const wastageSum = await prisma.wastageRecord.aggregate({
      where: {
        outletId: existing.outletId,
        preparationItemId: existing.preparationItemId,
        date: existing.date,
      },
      _sum: { wastedQuantity: true },
    });

    const otherPrepSum = await prisma.preparationLog.aggregate({
      where: {
        outletId: existing.outletId,
        preparationItemId: existing.preparationItemId,
        date: existing.date,
        id: { not: existing.id },
      },
      _sum: { quantity: true },
    });

    const totalWasted = Number(wastageSum._sum.wastedQuantity || 0);
    const remainingPrep = Number(otherPrepSum._sum.quantity || 0);

    if (remainingPrep < totalWasted) {
      return NextResponse.json(
        {
          error: `Cannot delete preparation record. Remaining preparation (${remainingPrep} ${existing.preparationItem.unit}) would be less than recorded wastage (${totalWasted} ${existing.preparationItem.unit}).`,
        },
        { status: 400 }
      );
    }

    await prisma.preparationLog.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: "Preparation record deleted successfully",
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message?.startsWith("CONFIGURATION")) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    if (err.message?.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("[Dashboard Prep DELETE Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

