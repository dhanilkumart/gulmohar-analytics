import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/scope";
import { prisma } from "@/lib/db/client";

/**
 * GET /api/operator/meta
 * Returns metadata required for Operator entry dropdowns:
 * - Active products in the organization (id, name, unit)
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

    const assignedOutlet = user.assignedOutlets[0];
    if (!assignedOutlet) {
      return NextResponse.json({ error: "No active assigned outlet found" }, { status: 403 });
    }

    // 1. Fetch available products in organization
    const products = await prisma.product.findMany({
      where: {
        organizationId: user.organizationId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        productCode: true,
        unit: true,
      },
      orderBy: { name: "asc" },
    });

    // 2. Fetch available departments for this specific outlet
    const departments = await prisma.department.findMany({
      where: {
        outletId: assignedOutlet.id,
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
      products,
      departments,
    });
  } catch (error) {
    console.error("[Operator Meta API Error]:", error);
    return NextResponse.json(
      { error: "Failed to load operational metadata" },
      { status: 500 }
    );
  }
}
