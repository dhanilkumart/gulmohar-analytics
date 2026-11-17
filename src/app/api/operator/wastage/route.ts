import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/scope";
import { prisma } from "@/lib/db/client";
import { Prisma } from "@prisma/client";

export async function POST(request: Request) {
  try {
    // 1. Authenticate user
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized: Active session required" }, { status: 401 });
    }

    // 2. Strict Operator Role Check
    if (user.role !== "operator") {
      return NextResponse.json(
        { error: "Forbidden: Only users with the Operator role may submit through this endpoint" },
        { status: 403 }
      );
    }

    // 3. Resolve Operator Authorized Outlet strictly from server-side database assignments
    const authorizedOutlet = user.assignedOutlets[0];
    if (!authorizedOutlet || !authorizedOutlet.id) {
      return NextResponse.json(
        { error: "Forbidden: Operator has no assigned restaurant outlet" },
        { status: 403 }
      );
    }

    // 4. Parse and validate body
    const body = await request.json();
    const {
      dish,
      productId,
      preparedQuantity,
      wastedQuantity,
      reason,
      notes,
      date,
    } = body;

    // Reject or ignore client-supplied security/financial fields
    // (outletId, recordedById, unitFoodCost, estimatedCost)

    // Validate quantities
    const prepQtyNum = Number(preparedQuantity);
    const wasteQtyNum = Number(wastedQuantity);

    if (
      isNaN(prepQtyNum) ||
      isNaN(wasteQtyNum) ||
      prepQtyNum <= 0 ||
      wasteQtyNum <= 0
    ) {
      return NextResponse.json(
        { error: "Prepared and wasted quantities must be positive numbers greater than 0" },
        { status: 400 }
      );
    }

    if (wasteQtyNum > prepQtyNum) {
      return NextResponse.json(
        { error: "Wasted quantity cannot exceed prepared quantity" },
        { status: 400 }
      );
    }

    // Validate Reason
    const sanitizedReason = typeof reason === "string" ? reason.trim() : "";
    if (!sanitizedReason) {
      return NextResponse.json({ error: "Reason for wastage is required" }, { status: 400 });
    }

    // Validate Date (defaults to today in UTC/IST if omitted, or validates parsed date)
    let entryDate = new Date();
    if (date) {
      const parsed = new Date(date);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
      }
      entryDate = parsed;
    }

    // 5. Resolve Product in PostgreSQL (by explicit productId or case-insensitive dish name)
    let targetProduct = null;
    if (productId && typeof productId === "string") {
      targetProduct = await prisma.product.findFirst({
        where: {
          id: productId,
          organizationId: user.organizationId,
          isActive: true,
        },
      });
    } else if (dish && typeof dish === "string") {
      const trimmedDish = dish.trim();
      targetProduct = await prisma.product.findFirst({
        where: {
          organizationId: user.organizationId,
          name: { equals: trimmedDish, mode: "insensitive" },
          isActive: true,
        },
      });
    }

    // If product is not found, dynamically link or create within the organization
    if (!targetProduct) {
      const dishName = typeof dish === "string" && dish.trim() ? dish.trim() : "Kitchen Item";

      // Find or create a default category for floor items
      let defaultCat = await prisma.category.findFirst({
        where: { organizationId: user.organizationId },
      });
      if (!defaultCat) {
        defaultCat = await prisma.category.create({
          data: {
            organizationId: user.organizationId,
            categoryCode: "CAT-GEN",
            name: "General Food Items",
          },
        });
      }

      // Generate a product code
      const generatedCode = `PRD-${Date.now().toString().slice(-6)}`;
      targetProduct = await prisma.product.create({
        data: {
          organizationId: user.organizationId,
          categoryId: defaultCat.id,
          productCode: generatedCode,
          name: dishName,
          defaultSellingPrice: new Prisma.Decimal("0.00"),
          foodCost: null, // Follow NULL-cost policy when unknown. Never assume zero!
          unit: "portion",
          isActive: true,
        },
      });
    }

    // 6. Server-Side Cost Computation (Strictly server calculated, NEVER client-trusted)
    // Formula: estimatedCost = wastedQuantity * unitFoodCost (or null if foodCost is null)
    let unitFoodCost: Prisma.Decimal | null = null;
    let estimatedCost: Prisma.Decimal | null = null;

    if (targetProduct.foodCost !== null) {
      unitFoodCost = new Prisma.Decimal(targetProduct.foodCost);
      estimatedCost = unitFoodCost.mul(new Prisma.Decimal(wasteQtyNum));
    }

    // 7. Persist WastageRecord to PostgreSQL
    const createdRecord = await prisma.wastageRecord.create({
      data: {
        outletId: authorizedOutlet.id, // Strictly server-resolved authorized outlet
        productId: targetProduct.id,
        recordedById: user.id, // Strictly authenticated user account
        date: entryDate,
        preparedQuantity: new Prisma.Decimal(prepQtyNum),
        wastedQuantity: new Prisma.Decimal(wasteQtyNum),
        unitFoodCost, // Server-computed or NULL
        estimatedCost, // Server-computed or NULL
        reason: sanitizedReason,
        notes: typeof notes === "string" ? notes.trim() : null,
      },
      include: {
        product: { select: { name: true, unit: true } },
        outlet: { select: { code: true, name: true } },
      },
    });

    // 8. Return success response (omitting confidential food costs from response if floor safety requires)
    return NextResponse.json({
      success: true,
      message: "Wastage record logged successfully",
      record: {
        id: createdRecord.id,
        dish: createdRecord.product.name,
        preparedQuantity: Number(createdRecord.preparedQuantity),
        wastedQuantity: Number(createdRecord.wastedQuantity),
        unit: createdRecord.product.unit,
        reason: createdRecord.reason,
        notes: createdRecord.notes,
        outletCode: createdRecord.outlet.code,
        date: createdRecord.date.toISOString(),
      },
    });
  } catch (error) {
    console.error("[Operator Wastage Entry API Error]:", error);
    return NextResponse.json(
      { error: "Failed to log wastage record. Please try again." },
      { status: 500 }
    );
  }
}
