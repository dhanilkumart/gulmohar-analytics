import { NextResponse } from "next/server";
import { getCurrentUser, resolveAuthorizedOutletScope } from "@/lib/auth/scope";
import { prisma } from "@/lib/db/client";
import { Prisma } from "@prisma/client";

/**
 * GET /api/dashboard/breakage
 * Reads outlet-scoped breakage records from PostgreSQL with filtering by date range and department.
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
    const requestedOutletId = searchParams.get("outletId");
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const departmentIdParam = searchParams.get("departmentId");

    // Authorize outlet access server-side
    const scope = await resolveAuthorizedOutletScope(user, requestedOutletId);

    const where: Prisma.BreakageRecordWhereInput = {};

    if (scope.targetOutletId) {
      where.outletId = scope.targetOutletId;
    } else if (scope.allowedOutlets.length > 0) {
      where.outletId = { in: scope.allowedOutlets.map((o) => o.id) };
    }

    if (startDateParam || endDateParam) {
      where.date = {};
      if (startDateParam) where.date.gte = new Date(startDateParam);
      if (endDateParam) where.date.lte = new Date(endDateParam);
    }

    if (departmentIdParam && departmentIdParam !== "all") {
      where.departmentId = departmentIdParam;
    }

    const records = await prisma.breakageRecord.findMany({
      where,
      include: {
        department: { select: { id: true, name: true, departmentCode: true } },
        outlet: { select: { id: true, code: true, name: true } },
        recordedBy: { select: { id: true, username: true, displayName: true } },
      },
      orderBy: { date: "desc" },
    });

    const mapped = records.map((r) => ({
      id: r.id,
      date: r.date.toISOString().split("T")[0],
      departmentId: r.departmentId,
      departmentName: r.department.name,
      item: r.item,
      quantity: r.brokenQty,
      cost: r.totalCost !== null ? Number(r.totalCost) : null,
      unitCost: r.unitCost !== null ? Number(r.unitCost) : null,
      reason: r.reason,
      notes: r.notes || "",
      outletId: r.outletId,
      outletCode: r.outlet.code,
      recordedBy: r.recordedBy.displayName,
    }));

    return NextResponse.json({
      success: true,
      outletScope: {
        targetOutletId: scope.targetOutletId,
        isConsolidated: scope.isConsolidated,
      },
      records: mapped,
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message?.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("[Dashboard Breakage GET Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/dashboard/breakage
 * Creates a breakage record by Manager or Admin.
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
    const {
      outletId,
      departmentId,
      item,
      quantity,
      reason,
      date,
      notes,
    } = body;

    // Resolve & authorize target outlet
    const scope = await resolveAuthorizedOutletScope(user, outletId);
    const targetOutletId = scope.targetOutletId || (scope.allowedOutlets[0]?.id);

    if (!targetOutletId) {
      return NextResponse.json({ error: "Target outlet is required" }, { status: 400 });
    }

    if (!item || typeof item !== "string") {
      return NextResponse.json({ error: "Item name is required" }, { status: 400 });
    }

    const qty = parseInt(String(quantity), 10);
    if (isNaN(qty) || qty <= 0) {
      return NextResponse.json({ error: "Quantity must be a positive integer" }, { status: 400 });
    }

    // Verify department belongs to the authorized target outlet
    const department = await prisma.department.findFirst({
      where: { id: departmentId, outletId: targetOutletId },
    });

    if (!department) {
      return NextResponse.json({ error: "Department does not exist in target outlet" }, { status: 400 });
    }

    // Cost policy: Breakage items have no master replacement-cost table in the current database schema.
    // Client-supplied cost fields must NEVER be trusted, and arbitrary hardcoded fallbacks must NEVER be used.
    // Therefore, unitCost and totalCost are stored as NULL (matching the strict NULL-cost policy).
    const unitCost: Prisma.Decimal | null = null;
    const totalCost: Prisma.Decimal | null = null;

    const entryDate = date ? new Date(date) : new Date();

    const newRecord = await prisma.breakageRecord.create({
      data: {
        outletId: targetOutletId,
        departmentId: department.id,
        recordedById: user.id,
        date: entryDate,
        item: item.trim(),
        brokenQty: qty,
        unitCost,
        totalCost,
        reason: reason ? String(reason).trim() : "Handling damage",
        notes: notes ? String(notes).trim() : null,
      },
      include: {
        department: { select: { name: true } },
        outlet: { select: { code: true } },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Breakage record created",
      record: {
        id: newRecord.id,
        date: newRecord.date.toISOString().split("T")[0],
        departmentId: newRecord.departmentId,
        departmentName: newRecord.department.name,
        item: newRecord.item,
        quantity: newRecord.brokenQty,
        unitCost: newRecord.unitCost !== null ? Number(newRecord.unitCost) : null,
        cost: newRecord.totalCost !== null ? Number(newRecord.totalCost) : null,
        reason: newRecord.reason,
        outletCode: newRecord.outlet.code,
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message?.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("[Dashboard Breakage POST Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PUT /api/dashboard/breakage
 * Updates a breakage record by Manager or Admin.
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
    const { id, item, quantity, reason, departmentId, notes } = body;

    if (!id) {
      return NextResponse.json({ error: "Record ID is required" }, { status: 400 });
    }

    const existing = await prisma.breakageRecord.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Breakage record not found" }, { status: 404 });
    }

    // Verify outlet scope authority
    await resolveAuthorizedOutletScope(user, existing.outletId);

    const qty = quantity !== undefined ? parseInt(String(quantity), 10) : existing.brokenQty;

    // Recalculate cost server-side: If a replacement-cost existed on record, recalculate totalCost.
    // Otherwise keep NULL (never trust client-supplied cost).
    let unitCost = existing.unitCost;
    let totalCost = existing.totalCost;
    if (unitCost !== null) {
      totalCost = unitCost.mul(new Prisma.Decimal(qty));
    } else {
      unitCost = null;
      totalCost = null;
    }

    const updated = await prisma.breakageRecord.update({
      where: { id },
      data: {
        item: item !== undefined ? String(item).trim() : existing.item,
        departmentId: departmentId || existing.departmentId,
        brokenQty: qty,
        unitCost,
        totalCost,
        reason: reason !== undefined ? String(reason).trim() : existing.reason,
        notes: notes !== undefined ? (notes ? String(notes).trim() : null) : existing.notes,
      },
      include: {
        department: { select: { name: true } },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Breakage record updated",
      record: {
        id: updated.id,
        date: updated.date.toISOString().split("T")[0],
        departmentId: updated.departmentId,
        departmentName: updated.department.name,
        item: updated.item,
        quantity: updated.brokenQty,
        unitCost: updated.unitCost !== null ? Number(updated.unitCost) : null,
        cost: updated.totalCost !== null ? Number(updated.totalCost) : null,
        reason: updated.reason,
        notes: updated.notes || "",
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message?.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("[Dashboard Breakage PUT Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * DELETE /api/dashboard/breakage
 * Deletes a breakage record by Manager or Admin.
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

    const existing = await prisma.breakageRecord.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Breakage record not found" }, { status: 404 });
    }

    // Verify outlet scope authority
    await resolveAuthorizedOutletScope(user, existing.outletId);

    await prisma.breakageRecord.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Breakage record deleted",
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message?.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("[Dashboard Breakage DELETE Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
