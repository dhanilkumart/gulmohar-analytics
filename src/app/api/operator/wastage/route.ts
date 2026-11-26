import { resolveRestaurantContext, validateRestaurantDepartment } from "@/lib/context/restaurant-context";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/scope";
import { prisma } from "@/lib/db/client";
import { Prisma } from "@prisma/client";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized: Active session required" }, { status: 401 });
    }

    if (user.role !== "operator") {
      return NextResponse.json(
        { error: "Forbidden: Only users with the Operator role may submit through this endpoint" },
        { status: 403 }
      );
    }

    const context = await resolveRestaurantContext(user);
    const authorizedOutlet = context.outlet;

    const body = await request.json();
    const { itemId, wastedQuantity, reason, notes, date } = body;

    const wasteQty = Number(wastedQuantity);
    if (isNaN(wasteQty) || wasteQty <= 0) {
      return NextResponse.json(
        { error: "Wasted quantity must be a positive number greater than 0" },
        { status: 400 }
      );
    }

    if (!itemId) {
      return NextResponse.json({ error: "Preparation item is required" }, { status: 400 });
    }

    const sanitizedReason = typeof reason === "string" ? reason.trim() : "";
    if (!sanitizedReason) {
      return NextResponse.json({ error: "Reason for wastage is required" }, { status: 400 });
    }

    let entryDate = new Date();
    if (date) {
      const parsed = new Date(date);
      if (!isNaN(parsed.getTime())) {
        entryDate = parsed;
      }
    }
    const dateObj = new Date(entryDate.toISOString().split("T")[0] + "T00:00:00.000Z");

    const newRecord = await prisma.$transaction(async (tx) => {
      // 1. Verify Item
      const item = await tx.preparationItem.findFirst({
        where: {
          id: itemId,
          organizationId: user.organizationId,
          isActive: true,
        },
      });

      if (!item) {
        throw new Error("NOT_FOUND: Specified preparation item not found or is inactive");
      }

      // 2. Check available prepared quantity
      const prepAgg = await tx.preparationLog.aggregate({
        where: {
          outletId: authorizedOutlet.id,
          preparationItemId: item.id,
          date: dateObj,
        },
        _sum: { quantity: true },
      });

      const totalPrepared = Number(prepAgg._sum.quantity || 0);

      const wasteAgg = await tx.wastageRecord.aggregate({
        where: {
          outletId: authorizedOutlet.id,
          preparationItemId: item.id,
          date: dateObj,
        },
        _sum: { wastedQuantity: true },
      });

      const totalAlreadyWasted = Number(wasteAgg._sum.wastedQuantity || 0);
      const available = Math.max(0, totalPrepared - totalAlreadyWasted);

      if (totalPrepared <= 0) {
        throw new Error(
          `VALIDATION: No preparation recorded for '${item.name}' on this date. Cannot record waste without preparation.`
        );
      }

      if (wasteQty > available) {
        throw new Error(
          `VALIDATION: Wasted quantity (${wasteQty} ${item.unit}) exceeds available prepared quantity (${available.toFixed(2)} ${item.unit}).`
        );
      }

      let unitCost: Prisma.Decimal | null = null;
      let estimatedCost: Prisma.Decimal | null = null;
      if (item.standardCost !== null) {
        unitCost = new Prisma.Decimal(item.standardCost);
        estimatedCost = unitCost.mul(new Prisma.Decimal(wasteQty));
      }

      await validateRestaurantDepartment(context, item.departmentId || null);

      return await tx.wastageRecord.create({
        data: {
          outletId: authorizedOutlet.id,
          preparationItemId: item.id,
          departmentId: item.departmentId || null,
          recordedById: user.id,
          date: dateObj,
          wastedQuantity: new Prisma.Decimal(wasteQty),
          unitCost,
          estimatedCost,
          reason: sanitizedReason,
          notes: notes ? String(notes).trim() : null,
        },
        include: {
          preparationItem: { select: { name: true, unit: true } },
          outlet: { select: { code: true } },
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Wastage recorded successfully",
      record: {
        id: newRecord.id,
        date: newRecord.date.toISOString().split("T")[0],
        itemName: newRecord.preparationItem.name,
        unit: newRecord.preparationItem.unit,
        wastedQuantity: Number(newRecord.wastedQuantity),
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
    console.error("[Operator Wastage POST Error]:", error);
    return NextResponse.json({ error: "Failed to log operational wastage" }, { status: 500 });
  }
}
