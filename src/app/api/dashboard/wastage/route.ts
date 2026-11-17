import { NextResponse } from "next/server";
import { getCurrentUser, resolveAuthorizedOutletScope } from "@/lib/auth/scope";
import { prisma } from "@/lib/db/client";
import { Prisma } from "@prisma/client";

/**
 * GET /api/dashboard/wastage
 * Reads outlet-scoped wastage records from PostgreSQL with filtering by date range, reason, and product.
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
    const reasonParam = searchParams.get("reason");
    const productIdParam = searchParams.get("productId");

    // Authorize outlet access server-side
    const scope = await resolveAuthorizedOutletScope(user, requestedOutletId);

    // Build Prisma where filter
    const where: Prisma.WastageRecordWhereInput = {};

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

    if (reasonParam && reasonParam !== "all") {
      where.reason = reasonParam;
    }

    if (productIdParam && productIdParam !== "all") {
      where.productId = productIdParam;
    }

    const records = await prisma.wastageRecord.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, foodCost: true, unit: true } },
        outlet: { select: { id: true, code: true, name: true } },
        recordedBy: { select: { id: true, username: true, displayName: true } },
      },
      orderBy: { date: "desc" },
    });

    const mapped = records.map((r) => ({
      id: r.id,
      date: r.date.toISOString().split("T")[0],
      productId: r.productId,
      productName: r.product.name,
      preparedQuantity: Number(r.preparedQuantity),
      wastedQuantity: Number(r.wastedQuantity),
      unitFoodCost: r.unitFoodCost !== null ? Number(r.unitFoodCost) : null,
      estimatedCost: r.estimatedCost !== null ? Number(r.estimatedCost) : null,
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
    console.error("[Dashboard Wastage GET Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/dashboard/wastage
 * Creates a wastage record by Manager or Admin with server-side food cost calculation.
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
      productId,
      dish,
      date,
      preparedQuantity,
      wastedQuantity,
      reason,
      notes,
    } = body;

    // Resolve & authorize target outlet
    const scope = await resolveAuthorizedOutletScope(user, outletId);
    const targetOutletId = scope.targetOutletId || (scope.allowedOutlets[0]?.id);

    if (!targetOutletId) {
      return NextResponse.json({ error: "Target outlet is required" }, { status: 400 });
    }

    const prepQty = Number(preparedQuantity);
    const wasteQty = Number(wastedQuantity);

    if (isNaN(prepQty) || isNaN(wasteQty) || prepQty <= 0 || wasteQty <= 0) {
      return NextResponse.json({ error: "Quantities must be positive numbers" }, { status: 400 });
    }

    if (wasteQty > prepQty) {
      return NextResponse.json({ error: "Wasted quantity cannot exceed prepared quantity" }, { status: 400 });
    }

    if (!reason || typeof reason !== "string") {
      return NextResponse.json({ error: "Reason is required" }, { status: 400 });
    }

    const entryDate = date ? new Date(date) : new Date();

    // Resolve Product
    let product = null;
    if (productId) {
      product = await prisma.product.findFirst({
        where: { id: productId, organizationId: user.organizationId },
      });
    } else if (dish) {
      product = await prisma.product.findFirst({
        where: { organizationId: user.organizationId, name: { equals: dish.trim(), mode: "insensitive" } },
      });
    }

    if (!product) {
      return NextResponse.json({ error: "Specified product does not exist" }, { status: 404 });
    }

    // Compute Cost server-side (Strictly NULL-cost policy when cost is missing)
    let unitFoodCost: Prisma.Decimal | null = null;
    let estimatedCost: Prisma.Decimal | null = null;

    if (product.foodCost !== null) {
      unitFoodCost = new Prisma.Decimal(product.foodCost);
      estimatedCost = unitFoodCost.mul(new Prisma.Decimal(wasteQty));
    }

    const newRecord = await prisma.wastageRecord.create({
      data: {
        outletId: targetOutletId,
        productId: product.id,
        recordedById: user.id,
        date: entryDate,
        preparedQuantity: new Prisma.Decimal(prepQty),
        wastedQuantity: new Prisma.Decimal(wasteQty),
        unitFoodCost,
        estimatedCost,
        reason: reason.trim(),
        notes: notes ? String(notes).trim() : null,
      },
      include: {
        product: { select: { name: true } },
        outlet: { select: { code: true } },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Wastage record created",
      record: {
        id: newRecord.id,
        date: newRecord.date.toISOString().split("T")[0],
        productId: newRecord.productId,
        productName: newRecord.product.name,
        preparedQuantity: Number(newRecord.preparedQuantity),
        wastedQuantity: Number(newRecord.wastedQuantity),
        unitFoodCost: newRecord.unitFoodCost !== null ? Number(newRecord.unitFoodCost) : null,
        estimatedCost: newRecord.estimatedCost !== null ? Number(newRecord.estimatedCost) : null,
        reason: newRecord.reason,
        notes: newRecord.notes || "",
        outletCode: newRecord.outlet.code,
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message?.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: err.message }, { status: 403 });
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
    const { id, preparedQuantity, wastedQuantity, reason, notes } = body;

    if (!id) {
      return NextResponse.json({ error: "Record ID is required" }, { status: 400 });
    }

    // Verify existing record
    const existing = await prisma.wastageRecord.findUnique({
      where: { id },
      include: { product: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Wastage record not found" }, { status: 404 });
    }

    // Check outlet authority
    await resolveAuthorizedOutletScope(user, existing.outletId);

    const prepQty = preparedQuantity !== undefined ? Number(preparedQuantity) : Number(existing.preparedQuantity);
    const wasteQty = wastedQuantity !== undefined ? Number(wastedQuantity) : Number(existing.wastedQuantity);

    if (wasteQty > prepQty) {
      return NextResponse.json({ error: "Wasted quantity cannot exceed prepared quantity" }, { status: 400 });
    }

    // Recalculate cost server-side
    let estimatedCost = existing.estimatedCost;
    if (existing.unitFoodCost !== null) {
      estimatedCost = existing.unitFoodCost.mul(new Prisma.Decimal(wasteQty));
    }

    const updated = await prisma.wastageRecord.update({
      where: { id },
      data: {
        preparedQuantity: new Prisma.Decimal(prepQty),
        wastedQuantity: new Prisma.Decimal(wasteQty),
        estimatedCost,
        reason: reason !== undefined ? String(reason).trim() : existing.reason,
        notes: notes !== undefined ? (notes ? String(notes).trim() : null) : existing.notes,
      },
      include: {
        product: { select: { name: true } },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Wastage record updated",
      record: {
        id: updated.id,
        date: updated.date.toISOString().split("T")[0],
        productId: updated.productId,
        productName: updated.product.name,
        preparedQuantity: Number(updated.preparedQuantity),
        wastedQuantity: Number(updated.wastedQuantity),
        estimatedCost: updated.estimatedCost !== null ? Number(updated.estimatedCost) : null,
        reason: updated.reason,
        notes: updated.notes || "",
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message?.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("[Dashboard Wastage PUT Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * DELETE /api/dashboard/wastage
 * Deletes a wastage record by Manager or Admin.
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

    // Verify outlet scope authority
    await resolveAuthorizedOutletScope(user, existing.outletId);

    await prisma.wastageRecord.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Wastage record deleted",
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message?.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("[Dashboard Wastage DELETE Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
