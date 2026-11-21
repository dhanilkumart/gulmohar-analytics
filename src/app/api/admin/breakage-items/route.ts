import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/scope";
import { prisma } from "@/lib/db/client";
import { Prisma } from "@prisma/client";

async function requireAdminUser() {
  const user = await getCurrentUser();
  if (!user) {
    return { errorResponse: NextResponse.json({ error: "Unauthorized: Active session required" }, { status: 401 }) };
  }
  if (user.role !== "admin" && user.role !== "manager") {
    return {
      errorResponse: NextResponse.json(
        { error: "Forbidden: Admin or Manager privileges required for master data management" },
        { status: 403 }
      ),
    };
  }
  return { user };
}

/**
 * GET /api/admin/breakage-items?isActive=all|true|false&search=<search>
 * List breakage items for the administrator's organization.
 */
export async function GET(request: Request) {
  try {
    const { user, errorResponse } = await requireAdminUser();
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(request.url);
    const isActiveParam = searchParams.get("isActive");
    const search = searchParams.get("search");

    const where: Prisma.BreakageItemWhereInput = {
      organizationId: user!.organizationId,
    };

    if (isActiveParam !== null && isActiveParam !== undefined && isActiveParam !== "all") {
      where.isActive = isActiveParam === "true";
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
      ];
    }

    const items = await prisma.breakageItem.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });

    const mapped = items.map((i) => ({
      id: i.id,
      code: i.code,
      name: i.name,
      category: i.category,
      replacementCost: i.replacementCost !== null ? Number(i.replacementCost) : null,
      isActive: i.isActive,
    }));

    return NextResponse.json({
      success: true,
      items: mapped,
    });
  } catch (err: any) {
    console.error("GET /api/admin/breakage-items error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/breakage-items
 * Create a new breakage item in the master catalog.
 */
export async function POST(request: Request) {
  try {
    const { user, errorResponse } = await requireAdminUser();
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const { code, name, category, replacementCost, isActive } = body;

    const sanitizedCode = typeof code === "string" ? code.trim().toUpperCase() : "";
    const sanitizedName = typeof name === "string" ? name.trim() : "";
    const sanitizedCategory = typeof category === "string" && category.trim() ? category.trim() : "Tableware";

    if (!sanitizedCode || !sanitizedName) {
      return NextResponse.json(
        { error: "Item Code and Name are required" },
        { status: 400 }
      );
    }

    // Uniqueness check within organization
    const existing = await prisma.breakageItem.findUnique({
      where: {
        organizationId_code: {
          organizationId: user!.organizationId,
          code: sanitizedCode,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Breakage item with code '${sanitizedCode}' already exists` },
        { status: 400 }
      );
    }

    let parsedCost: Prisma.Decimal | null = null;
    if (replacementCost !== undefined && replacementCost !== null && replacementCost !== "") {
      const num = Number(replacementCost);
      if (isNaN(num) || num < 0) {
        return NextResponse.json(
          { error: "Replacement cost must be a non-negative number" },
          { status: 400 }
        );
      }
      parsedCost = new Prisma.Decimal(num);
    }

    const created = await prisma.breakageItem.create({
      data: {
        organizationId: user!.organizationId,
        code: sanitizedCode,
        name: sanitizedName,
        category: sanitizedCategory,
        replacementCost: parsedCost,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      },
    });

    return NextResponse.json({
      success: true,
      item: {
        id: created.id,
        code: created.code,
        name: created.name,
        category: created.category,
        replacementCost: created.replacementCost !== null ? Number(created.replacementCost) : null,
        isActive: created.isActive,
      },
    });
  } catch (err: any) {
    console.error("POST /api/admin/breakage-items error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/breakage-items
 * Update an existing breakage item.
 */
export async function PUT(request: Request) {
  try {
    const { user, errorResponse } = await requireAdminUser();
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const { id, code, name, category, replacementCost, isActive } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Breakage Item ID is required" }, { status: 400 });
    }

    const existing = await prisma.breakageItem.findFirst({
      where: { id, organizationId: user!.organizationId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Breakage item not found" }, { status: 404 });
    }

    const data: Prisma.BreakageItemUpdateInput = {};

    if (code !== undefined) {
      const sanitizedCode = typeof code === "string" ? code.trim().toUpperCase() : "";
      if (!sanitizedCode) {
        return NextResponse.json({ error: "Item Code cannot be empty" }, { status: 400 });
      }
      if (sanitizedCode !== existing.code) {
        const duplicate = await prisma.breakageItem.findUnique({
          where: {
            organizationId_code: {
              organizationId: user!.organizationId,
              code: sanitizedCode,
            },
          },
        });
        if (duplicate) {
          return NextResponse.json(
            { error: `Breakage item with code '${sanitizedCode}' already exists` },
            { status: 400 }
          );
        }
        data.code = sanitizedCode;
      }
    }

    if (name !== undefined) {
      const sanitizedName = typeof name === "string" ? name.trim() : "";
      if (!sanitizedName) {
        return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
      }
      data.name = sanitizedName;
    }

    if (category !== undefined) {
      data.category = typeof category === "string" && category.trim() ? category.trim() : "Tableware";
    }

    if (replacementCost !== undefined) {
      if (replacementCost === null || replacementCost === "") {
        data.replacementCost = null;
      } else {
        const num = Number(replacementCost);
        if (isNaN(num) || num < 0) {
          return NextResponse.json({ error: "Replacement cost must be non-negative" }, { status: 400 });
        }
        data.replacementCost = new Prisma.Decimal(num);
      }
    }

    if (isActive !== undefined) {
      data.isActive = Boolean(isActive);
    }

    const updated = await prisma.breakageItem.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      success: true,
      item: {
        id: updated.id,
        code: updated.code,
        name: updated.name,
        category: updated.category,
        replacementCost: updated.replacementCost !== null ? Number(updated.replacementCost) : null,
        isActive: updated.isActive,
      },
    });
  } catch (err: any) {
    console.error("PUT /api/admin/breakage-items error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

