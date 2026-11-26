import "server-only";

import { getProductsFromDatabase } from "@/lib/data/products";
import type { SalesScope } from "@/lib/data/sales";
import type { Product, SaleItem } from "@/types";
import { getSaleItemsInRange } from "./sales";
import type { DateRange } from "./date-range";

export interface ProductProfitability {
  productId: string;
  name: string;
  categoryId: string;
  quantitySold: number;
  revenue: number;
  foodCost: number | null;
  /** revenue - foodCost, per business-rules.md's gross food margin definition. Null if foodCost is null. */
  grossMargin: number | null;
  /** grossMargin / revenue * 100, or 0 when revenue is 0. Null if grossMargin is null. */
  marginPercentage: number | null;
  /** True when food cost is recorded and known; false when food cost is null / unknown. */
  isCostKnown: boolean;
}

/** Food cost = sold quantity x product food cost (business-rules.md).
 * Returns null if any product sold has an unknown (null) food cost,
 * strictly preserving financial integrity without assuming zero food cost.
 */
export function getFoodCost(saleItems: SaleItem[], products: Product[]): number | null {
  const foodCostByProduct = new Map(products.map((p) => [p.product_id, p.food_cost]));
  let totalCost = 0;
  for (const item of saleItems) {
    const unitCost = foodCostByProduct.get(item.product_id);
    if (unitCost === null || unitCost === undefined) {
      return null;
    }
    totalCost += item.quantity * unitCost;
  }
  return totalCost;
}

/** Gross food margin = net sales - food cost (business-rules.md).
 * If either netSales or foodCost is null, margin is null.
 */
export function getGrossFoodMargin(netSales: number | null, foodCost: number | null): number | null {
  if (netSales === null || foodCost === null) return null;
  return netSales - foodCost;
}

/**
 * Per-product profitability for a date range: quantity sold, revenue,
 * food cost and gross margin, joined from sale-items + products.
 */
export async function getProductProfitability(range: DateRange, scope?: SalesScope): Promise<ProductProfitability[]> {
  const [saleItemsInRange, products] = await Promise.all([
    getSaleItemsInRange(range, scope),
    getProductsFromDatabase(scope),
  ]);

  const productsById = new Map(products.map((p) => [p.product_id, p]));

  const byProduct = new Map<
    string,
    { quantitySold: number; revenue: number }
  >();

  for (const item of saleItemsInRange) {
    const product = productsById.get(item.product_id);
    if (!product) continue;

    const existing = byProduct.get(item.product_id) ?? {
      quantitySold: 0,
      revenue: 0,
    };
    existing.quantitySold += item.quantity;
    existing.revenue += item.amount;
    byProduct.set(item.product_id, existing);
  }

  return Array.from(byProduct.entries()).map(([productId, agg]) => {
    const product = productsById.get(productId)!;
    const isCostKnown = product.food_cost !== null;
    const foodCost = isCostKnown ? agg.quantitySold * product.food_cost! : null;
    const grossMargin = foodCost !== null ? agg.revenue - foodCost : null;
    const marginPercentage =
      grossMargin !== null
        ? agg.revenue > 0
          ? (grossMargin / agg.revenue) * 100
          : 0
        : null;

    return {
      productId,
      name: product.name,
      categoryId: product.category_id,
      quantitySold: agg.quantitySold,
      revenue: agg.revenue,
      foodCost,
      grossMargin,
      marginPercentage,
      isCostKnown,
    };
  });
}

/**
 * Products whose gross margin is negative in the given range (i.e.
 * discounting/costs outweighed revenue). Only products with known costs
 * can be evaluated; uncosted items are excluded.
 */
export function getLossMakingProducts(
  productProfitability: ProductProfitability[]
): ProductProfitability[] {
  return productProfitability
    .filter((p): p is ProductProfitability & { grossMargin: number } => p.grossMargin !== null && p.grossMargin < 0)
    .sort((a, b) => a.grossMargin - b.grossMargin);
}

/** Top `limit` products by gross margin. Uncosted products are excluded. */
export function getHighProfitProducts(
  productProfitability: ProductProfitability[],
  limit = 10
): ProductProfitability[] {
  return productProfitability
    .filter((p): p is ProductProfitability & { grossMargin: number } => p.grossMargin !== null)
    .sort((a, b) => b.grossMargin - a.grossMargin)
    .slice(0, limit);
}

/**
 * High-volume products whose margin percentage is comparatively low.
 * Uncosted products are excluded.
 */
export function getHighSalesLowMarginProducts(
  productProfitability: ProductProfitability[],
  options: { volumePercentile?: number; marginPercentageThreshold?: number } = {}
): ProductProfitability[] {
  const { volumePercentile = 0.75, marginPercentageThreshold = 25 } = options;

  const validProducts = productProfitability.filter(
    (p): p is ProductProfitability & { marginPercentage: number } => p.marginPercentage !== null
  );

  if (validProducts.length === 0) return [];

  const sortedByVolume = [...validProducts].sort(
    (a, b) => a.quantitySold - b.quantitySold
  );
  const cutoffIndex = Math.floor(sortedByVolume.length * volumePercentile);
  const volumeThreshold = sortedByVolume[Math.min(cutoffIndex, sortedByVolume.length - 1)]
    .quantitySold;

  return validProducts
    .filter(
      (p) => p.quantitySold >= volumeThreshold && p.marginPercentage <= marginPercentageThreshold
    )
    .sort((a, b) => b.quantitySold - a.quantitySold);
}

/**
 * Low-volume products whose margin percentage is also comparatively low.
 * Uncosted products are excluded.
 */
export function getLowSalesLowMarginProducts(
  productProfitability: ProductProfitability[],
  options: { volumePercentile?: number; marginPercentageThreshold?: number } = {}
): ProductProfitability[] {
  const { volumePercentile = 0.25, marginPercentageThreshold = 25 } = options;

  const validProducts = productProfitability.filter(
    (p): p is ProductProfitability & { marginPercentage: number } => p.marginPercentage !== null
  );

  if (validProducts.length === 0) return [];

  const sortedByVolume = [...validProducts].sort(
    (a, b) => a.quantitySold - b.quantitySold
  );
  const cutoffIndex = Math.max(Math.ceil(sortedByVolume.length * volumePercentile) - 1, 0);
  const volumeThreshold = sortedByVolume[cutoffIndex].quantitySold;

  return validProducts
    .filter(
      (p) => p.quantitySold <= volumeThreshold && p.marginPercentage <= marginPercentageThreshold
    )
    .sort((a, b) => a.quantitySold - b.quantitySold);
}
