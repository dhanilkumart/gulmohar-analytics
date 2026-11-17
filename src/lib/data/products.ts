import "server-only";

import type { Product, PreparationType } from "@/types";
import { prisma } from "@/lib/db/client";
import { createCachedLoader, getDataSourceMode } from "./reader";

/**
 * Filter options for reading products from PostgreSQL or mock data.
 */
export interface ProductFilterOptions {
  organizationId?: string;
  outletId?: string;
  includeInactive?: boolean;
}

const loadProductsMock = createCachedLoader<Product[]>("products.json");

/**
 * Loads products from PostgreSQL (when DATA_SOURCE=database) or from mock data (default).
 *
 * Business Rules:
 * - Active filtering: By default, returns only active products (isActive = true),
 *   unless includeInactive is explicitly true.
 * - Category relationships: Resolves category code (e.g. "C01") via Category relation.
 * - Outlet-specific overrides: When outletId is provided, checks OutletProductSetting
 *   for price override and availability. If an outlet setting marks isAvailable = false,
 *   the product's effective active status reflects unavailable. If priceOverride exists,
 *   selling_price reflects the override.
 * - Strict NULL-cost policy: If foodCost is NULL, it remains NULL (never false 0.00).
 * - Gross margin per unit: Computed as selling_price - (foodCost ?? 0).
 * - Database errors: Throws explicit error without silent mock fallback.
 */
export async function getProducts(options?: ProductFilterOptions): Promise<Product[]> {
  const mode = getDataSourceMode();

  if (mode === "mock") {
    const products = loadProductsMock();
    if (options?.includeInactive) {
      return products;
    }
    return products.filter((p) => p.active !== false);
  }

  // Database mode: Read from PostgreSQL via Prisma
  try {
    const whereClause: {
      organizationId?: string;
      isActive?: boolean;
    } = {};

    if (options?.organizationId) {
      whereClause.organizationId = options.organizationId;
    }

    if (!options?.includeInactive) {
      whereClause.isActive = true;
    }

    const outletId = options?.outletId && options.outletId !== "all" ? options.outletId : undefined;

    const products = await prisma.product.findMany({
      where: whereClause,
      include: {
        category: {
          select: {
            id: true,
            categoryCode: true,
            name: true,
          },
        },
        outletSettings: outletId
          ? {
            where: { outletId },
            select: {
              priceOverride: true,
              isAvailable: true,
            },
          }
          : false,
      },
      orderBy: [{ category: { displayOrder: "asc" } }, { productCode: "asc" }],
    });

    return products.map((p) => {
      const outletSetting = p.outletSettings && p.outletSettings.length > 0 ? p.outletSettings[0] : undefined;

      const effectivePrice = outletSetting?.priceOverride !== null && outletSetting?.priceOverride !== undefined
        ? Number(outletSetting.priceOverride)
        : Number(p.defaultSellingPrice);

      const effectiveActive = outletSetting !== undefined
        ? (p.isActive && outletSetting.isAvailable)
        : p.isActive;

      const foodCost = p.foodCost !== null ? Number(p.foodCost) : null;
      const grossMargin = foodCost !== null ? effectivePrice - foodCost : null;

      const prepType: PreparationType = p.preparationType === "FRESH_DAILY" ? "fresh_daily" : "batch";

      return {
        product_id: p.productCode || p.id,
        name: p.name,
        category_id: p.category.categoryCode || p.category.id,
        selling_price: effectivePrice,
        food_cost: foodCost,
        unit: p.unit,
        active: effectiveActive,
        gross_margin_per_unit: grossMargin,
        preparation_type: prepType,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[DATA_SOURCE=database] Failed to load products from PostgreSQL: ${message}`);
  }
}