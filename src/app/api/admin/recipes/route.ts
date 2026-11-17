import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/scope";
import { prisma } from "@/lib/db/client";
import { Prisma } from "@prisma/client";

async function requireAdminUser() {
  const user = await getCurrentUser();
  if (!user) {
    return { errorResponse: NextResponse.json({ error: "Unauthorized: Active session required" }, { status: 401 }) };
  }
  if (user.role !== "admin") {
    return {
      errorResponse: NextResponse.json(
        { error: "Forbidden: Admin privileges required for master data management" },
        { status: 403 }
      ),
    };
  }
  return { user };
}

/**
 * GET /api/admin/recipes?productId=<productId>
 * List recipe items for a product or get ingredients available for recipe assignment.
 */
export async function GET(request: Request) {
  try {
    const { user, errorResponse } = await requireAdminUser();
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");

    if (!productId) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        recipes: {
          include: {
            ingredient: {
              select: { id: true, ingredientCode: true, name: true, unit: true, defaultCost: true, isActive: true },
            },
          },
          orderBy: { ingredient: { name: "asc" } },
        },
      },
    });

    if (!product || product.organizationId !== user!.organizationId) {
      return NextResponse.json({ error: "Product not found or unauthorized" }, { status: 404 });
    }

    // Also get all active ingredients in the organization for easy selection
    const availableIngredients = await prisma.ingredient.findMany({
      where: { organizationId: user!.organizationId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, ingredientCode: true, name: true, unit: true, defaultCost: true },
    });

    return NextResponse.json({
      success: true,
      product: {
        id: product.id,
        productCode: product.productCode,
        name: product.name,
        foodCost: product.foodCost !== null ? Number(product.foodCost) : null,
        unit: product.unit,
      },
      recipes: product.recipes.map((r) => ({
        id: r.id,
        ingredientId: r.ingredientId,
        ingredientCode: r.ingredient.ingredientCode,
        ingredientName: r.ingredient.name,
        ingredientUnit: r.ingredient.unit,
        quantityPerUnit: Number(r.quantityPerUnit),
        defaultCost: Number(r.ingredient.defaultCost),
        isActive: r.ingredient.isActive,
      })),
      availableIngredients: availableIngredients.map((ing) => ({
        id: ing.id,
        ingredientCode: ing.ingredientCode,
        name: ing.name,
        unit: ing.unit,
        defaultCost: Number(ing.defaultCost),
      })),
    });
  } catch (error: unknown) {
    console.error("[Admin Recipes GET Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/recipes
 * Add or update an ingredient in a product's recipe.
 */
export async function POST(request: Request) {
  try {
    const { user, errorResponse } = await requireAdminUser();
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const { productId, ingredientId, quantityPerUnit } = body;

    if (!productId || typeof productId !== "string") {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }
    if (!ingredientId || typeof ingredientId !== "string") {
      return NextResponse.json({ error: "Ingredient ID is required" }, { status: 400 });
    }

    const qtyNum = Number(quantityPerUnit);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      return NextResponse.json({ error: "Quantity per unit must be greater than zero" }, { status: 400 });
    }

    // Verify both product and ingredient belong to admin's organization
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product || product.organizationId !== user!.organizationId) {
      return NextResponse.json({ error: "Product not found or unauthorized" }, { status: 404 });
    }

    const ingredient = await prisma.ingredient.findUnique({
      where: { id: ingredientId },
    });
    if (!ingredient || ingredient.organizationId !== user!.organizationId) {
      return NextResponse.json({ error: "Ingredient not found or unauthorized" }, { status: 404 });
    }

    const recipeItem = await prisma.recipeItem.upsert({
      where: {
        productId_ingredientId: {
          productId,
          ingredientId,
        },
      },
      update: {
        quantityPerUnit: new Prisma.Decimal(qtyNum),
      },
      create: {
        productId,
        ingredientId,
        quantityPerUnit: new Prisma.Decimal(qtyNum),
      },
      include: {
        ingredient: { select: { name: true, unit: true, defaultCost: true } },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Recipe component saved successfully",
      recipeItem: {
        id: recipeItem.id,
        productId: recipeItem.productId,
        ingredientId: recipeItem.ingredientId,
        ingredientName: recipeItem.ingredient.name,
        ingredientUnit: recipeItem.ingredient.unit,
        quantityPerUnit: Number(recipeItem.quantityPerUnit),
      },
    }, { status: 201 });
  } catch (error: unknown) {
    console.error("[Admin Recipes POST Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/recipes?id=<recipeItemId>
 * Remove an ingredient component from a product's recipe.
 */
export async function DELETE(request: Request) {
  try {
    const { user, errorResponse } = await requireAdminUser();
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Recipe Item ID is required" }, { status: 400 });
    }

    const existing = await prisma.recipeItem.findUnique({
      where: { id },
      include: { product: true },
    });

    if (!existing || existing.product.organizationId !== user!.organizationId) {
      return NextResponse.json({ error: "Recipe component not found or unauthorized" }, { status: 404 });
    }

    await prisma.recipeItem.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Recipe component removed successfully",
    });
  } catch (error: unknown) {
    console.error("[Admin Recipes DELETE Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
