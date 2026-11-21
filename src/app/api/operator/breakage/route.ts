import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/scope";
import { prisma } from "@/lib/db/client";
import { Prisma } from "@prisma/client";

// Standard replacement costs for common crockery/glassware items
const STANDARD_ITEM_REPLACEMENT_COSTS: Record<string, number> = {
  "dinner plate": 180,
  "quarter plate": 120,
  "side plate": 110,
  "soup bowl": 95,
  "curry bowl": 85,
  "water glass": 65,
  "tea cup": 55,
  "coffee mug": 90,
  "serving bowl": 240,
  "glass tumbler": 60,
  "saucer": 45,
};

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
      item,
      departmentId,
      departmentName,
      brokenQuantity,
      reason,
      notes,
      date,
    } = body;

    // Validate Item Name
    const sanitizedItem = typeof item === "string" ? item.trim() : "";
    if (!sanitizedItem) {
      return NextResponse.json({ error: "Broken item name is required" }, { status: 400 });
    }

    // Validate Quantity
    const qtyNum = parseInt(String(brokenQuantity), 10);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      return NextResponse.json(
        { error: "Broken quantity must be a positive integer greater than 0" },
        { status: 400 }
      );
    }

    // Validate Reason
    const sanitizedReason = typeof reason === "string" ? reason.trim() : "Handling damage";

    // Validate Date
    let entryDate = new Date();
    if (date) {
      const parsed = new Date(date);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
      }
      entryDate = parsed;
    }

    // 5. Resolve & Validate Department strictly within the Operator's authorized outlet
    // (Prevents cross-outlet department referencing)
    let targetDepartment = null;

    if (departmentId && typeof departmentId === "string") {
      targetDepartment = await prisma.department.findFirst({
        where: {
          id: departmentId,
          outletId: authorizedOutlet.id, // Strictly scoped to operator's assigned outlet
        },
      });
    } else if (departmentName && typeof departmentName === "string") {
      targetDepartment = await prisma.department.findFirst({
        where: {
          outletId: authorizedOutlet.id,
          name: { equals: departmentName.trim(), mode: "insensitive" },
        },
      });
    }

    // If department does not exist in this outlet, find default or create one for this outlet
    if (!targetDepartment) {
      const deptName = typeof departmentName === "string" && departmentName.trim()
        ? departmentName.trim()
        : "Kitchen";

      targetDepartment = await prisma.department.findFirst({
        where: {
          outletId: authorizedOutlet.id,
          name: { equals: deptName, mode: "insensitive" },
        },
      });

      if (!targetDepartment) {
        // Auto-provision department for this outlet with unique code
        const deptCount = await prisma.department.count({ where: { outletId: authorizedOutlet.id } });
        const code = `D${String(deptCount + 1).padStart(2, "0")}`;
        targetDepartment = await prisma.department.create({
          data: {
            outletId: authorizedOutlet.id,
            departmentCode: code,
            name: deptName,
            benchmarkHeadcount: 0,
          },
        });
      }
    }

    // 6. Server-Side Financial Calculation from BreakageItem Master
    const breakageItemMaster = await prisma.breakageItem.findFirst({
      where: {
        organizationId: user.organizationId,
        name: { equals: sanitizedItem, mode: "insensitive" },
        isActive: true,
      },
    });

    let unitCost: Prisma.Decimal | null = null;
    let totalCost: Prisma.Decimal | null = null;

    if (breakageItemMaster && breakageItemMaster.replacementCost !== null) {
      unitCost = breakageItemMaster.replacementCost;
      totalCost = unitCost.mul(new Prisma.Decimal(qtyNum));
    } else {
      const lowerItem = sanitizedItem.toLowerCase();
      const matchedUnitCost = STANDARD_ITEM_REPLACEMENT_COSTS[lowerItem];
      if (matchedUnitCost !== undefined) {
        unitCost = new Prisma.Decimal(matchedUnitCost);
        totalCost = unitCost.mul(new Prisma.Decimal(qtyNum));
      }
    }

    // 7. Persist BreakageRecord to PostgreSQL
    const createdRecord = await prisma.breakageRecord.create({
      data: {
        outletId: authorizedOutlet.id, // Strictly server-resolved authorized outlet
        departmentId: targetDepartment.id, // Strictly validated outlet-specific department
        recordedById: user.id, // Strictly authenticated user account
        date: entryDate,
        item: breakageItemMaster ? breakageItemMaster.name : sanitizedItem,
        brokenQty: qtyNum,
        unitCost, // Server-computed
        totalCost, // Server-computed
        reason: sanitizedReason,
        notes: typeof notes === "string" ? notes.trim() : null,
      },
      include: {
        department: { select: { name: true, departmentCode: true } },
        outlet: { select: { code: true, name: true } },
      },
    });

    // 8. Return success response (omitting costs to protect operational confidentiality)
    return NextResponse.json({
      success: true,
      message: "Breakage record logged successfully",
      record: {
        id: createdRecord.id,
        item: createdRecord.item,
        brokenQuantity: createdRecord.brokenQty,
        departmentName: createdRecord.department.name,
        reason: createdRecord.reason,
        notes: createdRecord.notes,
        outletCode: createdRecord.outlet.code,
        date: createdRecord.date.toISOString(),
      },
    });
  } catch (error) {
    console.error("[Operator Breakage Entry API Error]:", error);
    return NextResponse.json(
      { error: "Failed to log breakage record. Please try again." },
      { status: 500 }
    );
  }
}
