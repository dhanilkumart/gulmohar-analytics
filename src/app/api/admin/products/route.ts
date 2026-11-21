import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/scope";
import { prisma } from "@/lib/db/client";
import { Prisma, PreparationType } from "@prisma/client";

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
 * GET /api/admin/products?categoryId=<categoryId>&search=<search>&outletId=<outletId>
 * List all organization products with their categories, food costs, and optional outlet settings.
 */
export async function GET(request: Request) {
  try {
    const { user, errorResponse } = await requireAdminUser();
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId");
    const search = searchParams.get("search");
    const outletId = searchParams.get("outletId");

    const where: Prisma.ProductWhereInput = {
      organizationId: user!.organizationId,
    };

    if (categoryId && categoryId !== "all") {
      where.categoryId = categoryId;
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { productCode: { contains: q, mode: "insensitive" } },
      ];
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        category: {
          select: { id: true, categoryCode: true, name: true },
        },
        outletSettings: outletId && outletId !== "all"
          ? {
              where: { outletId },
              select: {
                id: true,
                outletId: true,
                priceOverride: true,
                isAvailable: true,
                petpoojaItemId: true,
              },
            }
          : {
              include: {
                outlet: { select: { id: true, code: true, name: true } },
              },
            },
        recipes: {
          select: {
            id: true,
            ingredientId: true,
            quantityPerUnit: true,
            ingredient: {
              select: { id: true, ingredientCode: true, name: true, unit: true, defaultCost: true },
            },
          },
        },
        _count: {
          select: { orderItems: true },
        },
      },
      orderBy: [{ category: { displayOrder: "asc" } }, { productCode: "asc" }],
    });

    const categories = await prisma.category.findMany({
      where: { organizationId: user!.organizationId },
      orderBy: { displayOrder: "asc" },
      select: { id: true, categoryCode: true, name: true },
    });

    return NextResponse.json({
      success: true,
      categories,
      products: products.map((p) => ({
        id: p.id,
        productCode: p.productCode,
        name: p.name,
        categoryId: p.categoryId,
        categoryName: p.category.name,
        categoryCode: p.category.categoryCode,
        defaultSellingPrice: Number(p.defaultSellingPrice),
        foodCost: p.foodCost !== null ? Number(p.foodCost) : null,
        unit: p.unit,
        preparationType: p.preparationType,
        isActive: p.isActive,
        outletSettings: p.outletSettings.map((os) => ({
          id: os.id,
          outletId: os.outletId,
          priceOverride: os.priceOverride !== null ? Number(os.priceOverride) : null,
          isAvailable: os.isAvailable,
          petpoojaItemId: os.petpoojaItemId,
        })),
        recipeCount: p.recipes.length,
        recipes: p.recipes.map((r) => ({
          id: r.id,
          ingredientId: r.ingredientId,
          ingredientCode: r.ingredient.ingredientCode,
          ingredientName: r.ingredient.name,
          quantityPerUnit: Number(r.quantityPerUnit),
          unit: r.ingredient.unit,
          defaultCost: Number(r.ingredient.defaultCost),
        })),
        usageCount: p._count.orderItems,
      })),
    });
  } catch (error: unknown) {
    console.error("[Admin Products GET Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/products
 * Create a new product in the organization's master catalog.
 */
export async function POST(request: Request) {
  try {
    const { user, errorResponse } = await requireAdminUser();
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const {
      productCode,
      name,
      categoryId,
      defaultSellingPrice,
      foodCost,
      unit,
      preparationType,
      outletOverrides, // optional array of { outletId, priceOverride, isAvailable }
    } = body;

    if (!productCode || typeof productCode !== "string" || !productCode.trim()) {
      return NextResponse.json({ error: "Product code is required" }, { status: 400 });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Product name is required" }, { status: 400 });
    }
    if (!categoryId || typeof categoryId !== "string") {
      return NextResponse.json({ error: "Category is required" }, { status: 400 });
    }

    const priceNum = Number(defaultSellingPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      return NextResponse.json({ error: "Default selling price must be a non-negative number" }, { status: 400 });
    }

    // Food cost: Strict NULL-cost policy (if empty, null or undefined, store null; never zero)
    let foodCostDecimal: Prisma.Decimal | null = null;
    if (foodCost !== undefined && foodCost !== null && String(foodCost).trim() !== "") {
      const fcNum = Number(foodCost);
      if (isNaN(fcNum) || fcNum < 0) {
        return NextResponse.json({ error: "Food cost must be a non-negative number or empty" }, { status: 400 });
      }
      foodCostDecimal = new Prisma.Decimal(fcNum);
    }

    // Verify category belongs to organization
    const category = await prisma.category.findFirst({
      where: { id: categoryId, organizationId: user!.organizationId },
    });
    if (!category) {
      return NextResponse.json({ error: "Invalid category for your organization" }, { status: 400 });
    }

    const trimmedCode = productCode.trim().toUpperCase();
    const trimmedName = name.trim();

    // Check duplicate code
    const existing = await prisma.product.findUnique({
      where: {
        organizationId_productCode: {
          organizationId: user!.organizationId,
          productCode: trimmedCode,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Product code '${trimmedCode}' already exists in your organization` },
        { status: 409 }
      );
    }

    // Preparation type validation
    let prepType: PreparationType = PreparationType.BATCH;
    if (preparationType === "fresh_daily" || preparationType === PreparationType.FRESH_DAILY) {
      prepType = PreparationType.FRESH_DAILY;
    }

    // Transaction to create product + optional outlet settings
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          organizationId: user!.organizationId,
          categoryId,
          productCode: trimmedCode,
          name: trimmedName,
          defaultSellingPrice: new Prisma.Decimal(priceNum),
          foodCost: foodCostDecimal,
          unit: unit && typeof unit === "string" ? unit.trim() : "portion",
          preparationType: prepType,
          isActive: true,
        },
        include: {
          category: { select: { id: true, name: true, categoryCode: true } },
        },
      });

      if (Array.isArray(outletOverrides) && outletOverrides.length > 0) {
        for (const override of outletOverrides) {
          if (override.outletId) {
            const price = override.priceOverride !== undefined && override.priceOverride !== null && override.priceOverride !== ""
              ? new Prisma.Decimal(Number(override.priceOverride))
              : null;
            await tx.outletProductSetting.upsert({
              where: {
                outletId_productId: {
                  outletId: override.outletId,
                  productId: product.id,
                },
              },
              update: {
                priceOverride: price,
                isAvailable: override.isAvailable !== undefined ? Boolean(override.isAvailable) : true,
              },
              create: {
                outletId: override.outletId,
                productId: product.id,
                priceOverride: price,
                isAvailable: override.isAvailable !== undefined ? Boolean(override.isAvailable) : true,
              },
            });
          }
        }
      }

      return product;
    });

    return NextResponse.json({
      success: true,
      message: "Product created successfully",
      product: result,
    }, { status: 201 });
  } catch (error: unknown) {
    console.error("[Admin Products POST Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/products
 * Edit product details, category, default selling price, food cost, active status, or outlet settings.
 */
export async function PUT(request: Request) {
  try {
    const { user, errorResponse } = await requireAdminUser();
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const {
      id,
      name,
      categoryId,
      defaultSellingPrice,
      foodCost,
      unit,
      preparationType,
      isActive,
      outletOverrides, // optional array of { outletId, priceOverride, isAvailable }
    } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    const existing = await prisma.product.findUnique({
      where: { id },
    });

    if (!existing || existing.organizationId !== user!.organizationId) {
      return NextResponse.json({ error: "Product not found or unauthorized" }, { status: 404 });
    }

    const data: Prisma.ProductUpdateInput = {};
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json({ error: "Product name cannot be empty" }, { status: 400 });
      }
      data.name = name.trim();
    }

    if (categoryId !== undefined) {
      const cat = await prisma.category.findFirst({
        where: { id: categoryId, organizationId: user!.organizationId },
      });
      if (!cat) {
        return NextResponse.json({ error: "Invalid category" }, { status: 400 });
      }
      data.category = { connect: { id: categoryId } };
    }

    if (defaultSellingPrice !== undefined) {
      const p = Number(defaultSellingPrice);
      if (isNaN(p) || p < 0) {
        return NextResponse.json({ error: "Invalid default selling price" }, { status: 400 });
      }
      data.defaultSellingPrice = new Prisma.Decimal(p);
    }

    if (foodCost !== undefined) {
      if (foodCost === null || String(foodCost).trim() === "") {
        data.foodCost = null; // Strict NULL-cost policy
      } else {
        const fc = Number(foodCost);
        if (isNaN(fc) || fc < 0) {
          return NextResponse.json({ error: "Invalid food cost" }, { status: 400 });
        }
        data.foodCost = new Prisma.Decimal(fc);
      }
    }

    if (unit !== undefined) {
      data.unit = String(unit).trim() || existing.unit;
    }

    if (preparationType !== undefined) {
      data.preparationType =
        preparationType === "fresh_daily" || preparationType === PreparationType.FRESH_DAILY
          ? PreparationType.FRESH_DAILY
          : PreparationType.BATCH;
    }

    if (isActive !== undefined) {
      data.isActive = Boolean(isActive);
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data,
        include: {
          category: { select: { id: true, name: true, categoryCode: true } },
        },
      });

      if (Array.isArray(outletOverrides)) {
        for (const override of outletOverrides) {
          if (override.outletId) {
            // Verify outlet belongs to organization
            const outlet = await tx.outlet.findFirst({
              where: { id: override.outletId, organizationId: user!.organizationId },
            });
            if (outlet) {
              const price = override.priceOverride !== undefined && override.priceOverride !== null && override.priceOverride !== ""
                ? new Prisma.Decimal(Number(override.priceOverride))
                : null;
              await tx.outletProductSetting.upsert({
                where: {
                  outletId_productId: {
                    outletId: override.outletId,
                    productId: id,
                  },
                },
                update: {
                  priceOverride: price,
                  isAvailable: override.isAvailable !== undefined ? Boolean(override.isAvailable) : true,
                },
                create: {
                  outletId: override.outletId,
                  productId: id,
                  priceOverride: price,
                  isAvailable: override.isAvailable !== undefined ? Boolean(override.isAvailable) : true,
                },
              });
            }
          }
        }
      }

      return updated;
    });

    return NextResponse.json({
      success: true,
      message: "Product updated successfully",
      product: result,
    });
  } catch (error: unknown) {
    console.error("[Admin Products PUT Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
