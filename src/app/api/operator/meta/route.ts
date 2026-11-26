import { resolveRestaurantContext } from "@/lib/context/restaurant-context";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/scope";
import { prisma } from "@/lib/db/client";

/**
 * GET /api/operator/meta
 * Returns metadata required for Operator entry dropdowns:
 * - Active preparation items in the organization (id, name, code, unit)
 * - Active departments in the operator's assigned outlet (id, name, departmentCode)
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role !== "operator") {
      return NextResponse.json({ error: "Forbidden: Operator role required" }, { status: 403 });
    }

    const context = await resolveRestaurantContext(user);
    const assignedOutlet = context.outlet;

    // 1. Fetch available preparation items in organization
    const preparationItems = await prisma.preparationItem.findMany({
      where: {
        organizationId: user.organizationId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        code: true,
        unit: true,
        departmentId: true,
      },
      orderBy: { name: "asc" },
    });

    // 2. Fetch active breakage items in organization
    const breakageItems = await prisma.breakageItem.findMany({
      where: {
        organizationId: user.organizationId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        code: true,
        category: true,
        replacementCost: true,
      },
      orderBy: { name: "asc" },
    });

    // 3. Fetch active wastage reasons in organization
    const wastageReasons = await prisma.wastageReason.findMany({
      where: {
        organizationId: user.organizationId,
        isActive: true,
      },
      select: {
        id: true,
        code: true,
        label: true,
      },
      orderBy: [{ displayOrder: "asc" }, { label: "asc" }],
    });

    // 4. Fetch active breakage reasons in organization
    const breakageReasons = await prisma.breakageReason.findMany({
      where: {
        organizationId: user.organizationId,
        isActive: true,
      },
      select: {
        id: true,
        code: true,
        label: true,
      },
      orderBy: [{ displayOrder: "asc" }, { label: "asc" }],
    });

    // 5. Fetch available departments for this specific outlet
    const departments = await prisma.department.findMany({
      where: {
        outletId: assignedOutlet.id,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        departmentCode: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      success: true,
      outlet: assignedOutlet,
      preparationItems,
      breakageItems: breakageItems.map((b) => ({
        id: b.id,
        code: b.code,
        name: b.name,
        category: b.category,
        replacementCost: b.replacementCost !== null ? Number(b.replacementCost) : null,
      })),
      wastageReasons,
      breakageReasons,
      departments,
    });
  } catch (error: unknown) {
    if (error instanceof Error && /^(FORBIDDEN|CONFIGURATION):/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message.startsWith("FORBIDDEN") ? 403 : 500 });
    }
    console.error("[Operator Meta API Error]:", error);
    return NextResponse.json(
      { error: "Failed to load operational metadata" },
      { status: 500 }
    );
  }
}
