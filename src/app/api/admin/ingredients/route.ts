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
 * GET /api/admin/ingredients?search=<search>
 * List all organization ingredients with their units, default costs, and recipe usage count.
 */
export async function GET(request: Request) {
  try {
    const { user, errorResponse } = await requireAdminUser();
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");

    const where: Prisma.IngredientWhereInput = {
      organizationId: user!.organizationId,
    };

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { ingredientCode: { contains: q, mode: "insensitive" } },
      ];
    }

    const ingredients = await prisma.ingredient.findMany({
      where,
      include: {
        _count: {
          select: { recipeItems: true },
        },
      },
      orderBy: { ingredientCode: "asc" },
    });

    return NextResponse.json({
      success: true,
      ingredients: ingredients.map((ing) => ({
        id: ing.id,
        ingredientCode: ing.ingredientCode,
        name: ing.name,
        unit: ing.unit,
        defaultCost: Number(ing.defaultCost),
        isActive: ing.isActive,
        recipeCount: ing._count.recipeItems,
      })),
    });
  } catch (error: unknown) {
    console.error("[Admin Ingredients GET Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/ingredients
 * Create a new ingredient in the organization's master catalog.
 */
export async function POST(request: Request) {
  try {
    const { user, errorResponse } = await requireAdminUser();
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const { ingredientCode, name, unit, defaultCost } = body;

    if (!ingredientCode || typeof ingredientCode !== "string" || !ingredientCode.trim()) {
      return NextResponse.json({ error: "Ingredient code is required" }, { status: 400 });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Ingredient name is required" }, { status: 400 });
    }
    if (!unit || typeof unit !== "string" || !unit.trim()) {
      return NextResponse.json({ error: "Unit of measurement is required" }, { status: 400 });
    }

    const costNum = Number(defaultCost);
    if (isNaN(costNum) || costNum < 0) {
      return NextResponse.json({ error: "Default cost must be a non-negative number" }, { status: 400 });
    }

    const trimmedCode = ingredientCode.trim().toUpperCase();
    const trimmedName = name.trim();
    const trimmedUnit = unit.trim().toLowerCase();

    // Check duplicate code
    const existing = await prisma.ingredient.findUnique({
      where: {
        organizationId_ingredientCode: {
          organizationId: user!.organizationId,
          ingredientCode: trimmedCode,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Ingredient code '${trimmedCode}' already exists in your organization` },
        { status: 409 }
      );
    }

    const ingredient = await prisma.ingredient.create({
      data: {
        organizationId: user!.organizationId,
        ingredientCode: trimmedCode,
        name: trimmedName,
        unit: trimmedUnit,
        defaultCost: new Prisma.Decimal(costNum),
        isActive: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Ingredient created successfully",
      ingredient,
    }, { status: 201 });
  } catch (error: unknown) {
    console.error("[Admin Ingredients POST Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/ingredients
 * Edit ingredient name, unit, default cost, or active status.
 */
export async function PUT(request: Request) {
  try {
    const { user, errorResponse } = await requireAdminUser();
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const { id, name, unit, defaultCost, isActive } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Ingredient ID is required" }, { status: 400 });
    }

    const existing = await prisma.ingredient.findUnique({
      where: { id },
    });

    if (!existing || existing.organizationId !== user!.organizationId) {
      return NextResponse.json({ error: "Ingredient not found or unauthorized" }, { status: 404 });
    }

    const data: Prisma.IngredientUpdateInput = {};
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json({ error: "Ingredient name cannot be empty" }, { status: 400 });
      }
      data.name = name.trim();
    }
    if (unit !== undefined) {
      if (typeof unit !== "string" || !unit.trim()) {
        return NextResponse.json({ error: "Unit cannot be empty" }, { status: 400 });
      }
      data.unit = unit.trim().toLowerCase();
    }
    if (defaultCost !== undefined) {
      const c = Number(defaultCost);
      if (isNaN(c) || c < 0) {
        return NextResponse.json({ error: "Invalid default cost" }, { status: 400 });
      }
      data.defaultCost = new Prisma.Decimal(c);
    }
    if (isActive !== undefined) {
      data.isActive = Boolean(isActive);
    }

    const updated = await prisma.ingredient.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      success: true,
      message: "Ingredient updated successfully",
      ingredient: updated,
    });
  } catch (error: unknown) {
    console.error("[Admin Ingredients PUT Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
