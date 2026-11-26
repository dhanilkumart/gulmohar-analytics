import { resolveRestaurantContext, assertRestaurantRecord, validateRestaurantDepartment } from "@/lib/context/restaurant-context";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/scope";
import { prisma } from "@/lib/db/client";
import { Prisma } from "@prisma/client";

/**
 * GET /api/dashboard/wastage
 * Reads outlet-scoped wastage records from PostgreSQL with filtering by date range, reason, and preparation item.
 */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role === "operator") {
      return NextResponse.json({ error: "Forbidden: Operator role lacks management dashboard access" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const reasonParam = searchParams.get("reason");
    const itemIdParam = searchParams.get("itemId");

    // Authorize outlet access server-side
    const context = await resolveRestaurantContext(user);

    // Build Prisma where filter
    const where: Prisma.WastageRecordWhereInput = {};

    where.outletId = context.outletId;

    if (startDateParam || endDateParam) {
      where.date = {};
      if (startDateParam) where.date.gte = new Date(startDateParam);
      if (endDateParam) where.date.lte = new Date(endDateParam);
    }

    if (reasonParam && reasonParam !== "all") {
      where.reason = reasonParam;
    }

    if (itemIdParam && itemIdParam !== "all") {
      where.preparationItemId = itemIdParam;
    }

    const records = await prisma.wastageRecord.findMany({
      where,
      include: {
        preparationItem: { select: { id: true, name: true, code: true, unit: true, standardCost: true } },
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
      wastedQuantity: Number(r.wastedQuantity),
      unitCost: r.unitCost !== null ? Number(r.unitCost) : null,
      estimatedCost: r.estimatedCost !== null ? Number(r.estimatedCost) : null,
      reason: r.reason,
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
    if (error instanceof Error && /^(FORBIDDEN|CONFIGURATION):/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message.startsWith("FORBIDDEN") ? 403 : 500 });
    }
    console.error("[Dashboard Wastage GET Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/dashboard/wastage
 * Creates a wastage record against a preparation item with strict server-side available quantity verification.
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role === "operator") {
      return NextResponse.json({ error: "Forbidden: Operators must use floor portal" }, { status: 403 });
    }

    const body = await request.json();
    const { itemId, date, wastedQuantity, reason, departmentId, notes } = body;

    // Resolve & authorize target outlet safely
    const context = await resolveRestaurantContext(user);
    const targetOutletId = context.outletId;

    const wasteQty = Number(wastedQuantity);
    if (isNaN(wasteQty) || wasteQty <= 0) {
      return NextResponse.json({ error: "Wasted quantity must be a positive number greater than 0" }, { status: 400 });
    }

    if (!itemId) {
      return NextResponse.json({ error: "Preparation item is required" }, { status: 400 });
    }

    if (!reason || typeof reason !== "string" || !reason.trim()) {
      return NextResponse.json({ error: "Reason is required" }, { status: 400 });
    }

    const entryDate = date ? new Date(date) : new Date();
    // Normalize date to YYYY-MM-DD
    const dateObj = new Date(entryDate.toISOString().split("T")[0] + "T00:00:00.000Z");

    // Execute within transaction for concurrency-safe available quantity check
    const newRecord = await prisma.$transaction(async (tx) => {
      // 1. Verify item
      const item = await tx.preparationItem.findFirst({
        where: { id: itemId, organizationId: user.organizationId, isActive: true },
      });

      if (!item) {
        throw new Error("NOT_FOUND: Specified preparation item does not exist or is inactive");
      }

      // 2. Compute total prepared quantity for this outlet, item, and date
      const prepAgg = await tx.preparationLog.aggregate({
        where: {
          outletId: targetOutletId,
          preparationItemId: item.id,
          date: dateObj,
        },
        _sum: { quantity: true },
      });

      const totalPrepared = Number(prepAgg._sum.quantity || 0);

      // 3. Compute total existing wastage for this outlet, item, and date
      const wasteAgg = await tx.wastageRecord.aggregate({
        where: {
          outletId: targetOutletId,
          preparationItemId: item.id,
          date: dateObj,
        },
        _sum: { wastedQuantity: true },
      });

      const totalAlreadyWasted = Number(wasteAgg._sum.wastedQuantity || 0);
      const availableQuantity = Math.max(0, totalPrepared - totalAlreadyWasted);

      if (totalPrepared <= 0) {
        throw new Error(
          `VALIDATION: No preparation recorded for '${item.name}' on this date. Cannot record wastage without prior preparation.`
        );
      }

      if (wasteQty > availableQuantity) {
        throw new Error(
          `VALIDATION: Wasted quantity (${wasteQty} ${item.unit}) exceeds available prepared quantity (${availableQuantity.toFixed(2)} ${item.unit}). Prepared: ${totalPrepared}, already wasted: ${totalAlreadyWasted}.`
        );
      }

      // 4. Calculate unit cost and estimated cost server-side
      let unitCost: Prisma.Decimal | null = null;
      let estimatedCost: Prisma.Decimal | null = null;

      if (item.standardCost !== null) {
        unitCost = new Prisma.Decimal(item.standardCost);
        estimatedCost = unitCost.mul(new Prisma.Decimal(wasteQty));
      }

      await validateRestaurantDepartment(context, departmentId || item.departmentId || null);

      return await tx.wastageRecord.create({
        data: {
          outletId: targetOutletId,
          preparationItemId: item.id,
          departmentId: departmentId || item.departmentId || null,
          recordedById: user.id,
          date: dateObj,
          wastedQuantity: new Prisma.Decimal(wasteQty),
          unitCost,
          estimatedCost,
          reason: reason.trim(),
          notes: notes ? String(notes).trim() : null,
        },
        include: {
          preparationItem: { select: { name: true, code: true, unit: true } },
          outlet: { select: { code: true } },
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Wastage record created successfully",
      record: {
        id: newRecord.id,
        date: newRecord.date.toISOString().split("T")[0],
        itemId: newRecord.preparationItemId,
        itemName: newRecord.preparationItem.name,
        itemCode: newRecord.preparationItem.code,
        unit: newRecord.preparationItem.unit,
        wastedQuantity: Number(newRecord.wastedQuantity),
        unitCost: newRecord.unitCost !== null ? Number(newRecord.unitCost) : null,
        estimatedCost: newRecord.estimatedCost !== null ? Number(newRecord.estimatedCost) : null,
        reason: newRecord.reason,
        notes: newRecord.notes || "",
        outletCode: newRecord.outlet.code,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && /^(FORBIDDEN|CONFIGURATION):/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message.startsWith("FORBIDDEN") ? 403 : 500 });
    }
    const err = error as Error;
    if (err.message?.startsWith("NOT_FOUND")) {
      return NextResponse.json({ error: err.message.replace("NOT_FOUND: ", "") }, { status: 404 });
    }
    if (err.message?.startsWith("VALIDATION")) {
      return NextResponse.json({ error: err.message.replace("VALIDATION: ", "") }, { status: 400 });
    }
    console.error("[Dashboard Wastage POST Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PUT /api/dashboard/wastage
 * Updates an existing wastage record by Manager or Admin.
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
    const { id, wastedQuantity, reason, departmentId, notes } = body;

    if (!id) {
      return NextResponse.json({ error: "Record ID is required" }, { status: 400 });
    }

    const existing = await prisma.wastageRecord.findUnique({
      where: { id },
      include: { preparationItem: true, outlet: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Wastage record not found" }, { status: 404 });
    }

    const context = await resolveRestaurantContext(user);
    assertRestaurantRecord(context, existing);

    const wasteQty = Number(wastedQuantity);
    if (isNaN(wasteQty) || wasteQty <= 0) {
      return NextResponse.json({ error: "Wasted quantity must be greater than 0" }, { status: 400 });
    }

    // Concurrency-safe check inside transaction
    await validateRestaurantDepartment(context, departmentId || null);

    const updated = await prisma.$transaction(async (tx) => {
      const prepAgg = await tx.preparationLog.aggregate({
        where: {
          outletId: existing.outletId,
          preparationItemId: existing.preparationItemId,
          date: existing.date,
        },
        _sum: { quantity: true },
      });

      const otherWasteAgg = await tx.wastageRecord.aggregate({
        where: {
          outletId: existing.outletId,
          preparationItemId: existing.preparationItemId,
          date: existing.date,
          id: { not: existing.id },
        },
        _sum: { wastedQuantity: true },
      });

      const totalPrepared = Number(prepAgg._sum.quantity || 0);
      const otherWasted = Number(otherWasteAgg._sum.wastedQuantity || 0);
      const available = Math.max(0, totalPrepared - otherWasted);

      if (wasteQty > available) {
        throw new Error(
          `VALIDATION: Wasted quantity (${wasteQty} ${existing.preparationItem.unit}) exceeds available prepared quantity (${available.toFixed(2)} ${existing.preparationItem.unit}).`
        );
      }

      const unitCost: Prisma.Decimal | null = existing.unitCost;
      let estimatedCost: Prisma.Decimal | null = null;
      if (unitCost !== null) {
        estimatedCost = unitCost.mul(new Prisma.Decimal(wasteQty));
      }

      return await tx.wastageRecord.update({
        where: { id },
        data: {
          wastedQuantity: new Prisma.Decimal(wasteQty),
          estimatedCost,
          reason: reason ? String(reason).trim() : existing.reason,
          departmentId: departmentId || null,
          notes: notes ? String(notes).trim() : null,
        },
        include: {
          preparationItem: { select: { name: true, code: true, unit: true } },
          outlet: { select: { code: true } },
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Wastage record updated successfully",
      record: {
        id: updated.id,
        date: updated.date.toISOString().split("T")[0],
        itemId: updated.preparationItemId,
        itemName: updated.preparationItem.name,
        itemCode: updated.preparationItem.code,
        unit: updated.preparationItem.unit,
        wastedQuantity: Number(updated.wastedQuantity),
        unitCost: updated.unitCost !== null ? Number(updated.unitCost) : null,
        estimatedCost: updated.estimatedCost !== null ? Number(updated.estimatedCost) : null,
        reason: updated.reason,
        notes: updated.notes || "",
        outletCode: updated.outlet.code,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && /^(FORBIDDEN|CONFIGURATION):/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message.startsWith("FORBIDDEN") ? 403 : 500 });
    }
    const err = error as Error;
    if (err.message?.startsWith("VALIDATION")) {
      return NextResponse.json({ error: err.message.replace("VALIDATION: ", "") }, { status: 400 });
    }
    console.error("[Dashboard Wastage PUT Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * DELETE /api/dashboard/wastage
 * Deletes a wastage record.
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

    const existing = await prisma.wastageRecord.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Wastage record not found" }, { status: 404 });
    }

    const context = await resolveRestaurantContext(user);
    assertRestaurantRecord(context, existing);

    await prisma.wastageRecord.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: "Wastage record deleted successfully",
    });
  } catch (error: unknown) {
    if (error instanceof Error && /^(FORBIDDEN|CONFIGURATION):/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message.startsWith("FORBIDDEN") ? 403 : 500 });
    }
    console.error("[Dashboard Wastage DELETE Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
