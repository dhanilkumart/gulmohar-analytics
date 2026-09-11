import "server-only";

import { getProducts } from "@/lib/data";
import type { Product, SaleItem } from "@/types";
import { getSaleItemsInRange } from "./sales";
import type { DateRange } from "./date-range";

export interface ProductProfitability {
  productId: string;
  name: string;
  categoryId: string;
  quantitySold: number;
  revenue: number;
  foodCost: number;
  /** revenue - foodCost, per business-rules.md's gross food margin definition. */
  grossMargin: number;
  /** grossMargin / revenue * 100, or 0 when revenue is 0. */
  marginPercentage: number;
}

/** Food cost = sold quantity x product food cost (business-rules.md). */
export function getFoodCost(saleItems: SaleItem[], products: Product[]): number {
  const foodCostByProduct = new Map(products.map((p) => [p.product_id, p.food_cost]));
  return saleItems.reduce((sum, item) => {
    const unitFoodCost = foodCostByProduct.get(item.product_id) ?? 0;
    return sum + item.quantity * unitFoodCost;
  }, 0);
}

/** Gross food margin = net sales - food cost (business-rules.md). */
export function getGrossFoodMargin(netSales: number, foodCost: number): number {
  return netSales - foodCost;
}

/**
 * Per-product profitability for a date range: quantity sold, revenue,
 * food cost and gross margin, joined from sale-items + products.
 */
export async function getProductProfitability(range: DateRange): Promise<ProductProfitability[]> {
  const [saleItemsInRange, products] = await Promise.all([
    getSaleItemsInRange(range),
    getProducts(),
  ]);

  const productsById = new Map(products.map((p) => [p.product_id, p]));

  const byProduct = new Map<
    string,
    { quantitySold: number; revenue: number; foodCost: number }
  >();

  for (const item of saleItemsInRange) {
    const product = productsById.get(item.product_id);
    if (!product) continue;

    const existing = byProduct.get(item.product_id) ?? {
      quantitySold: 0,
      revenue: 0,
      foodCost: 0,
    };
    existing.quantitySold += item.quantity;
    existing.revenue += item.amount;
    existing.foodCost += item.quantity * product.food_cost;
    byProduct.set(item.product_id, existing);
  }

  return Array.from(byProduct.entries()).map(([productId, agg]) => {
    const product = productsById.get(productId)!;
    const grossMargin = agg.revenue - agg.foodCost;
    return {
      productId,
      name: product.name,
      categoryId: product.category_id,
      quantitySold: agg.quantitySold,
      revenue: agg.revenue,
      foodCost: agg.foodCost,
      grossMargin,
      marginPercentage: agg.revenue > 0 ? (grossMargin / agg.revenue) * 100 : 0,
    };
  });
}

/**
 * Products whose gross margin is negative in the given range (i.e.
 * discounting/costs outweighed revenue). Not necessarily present in every
 * range — the mock data's food costs are all below selling price, so this
 * only surfaces when discounts are heavy enough.
 */
export function getLossMakingProducts(
  productProfitability: ProductProfitability[]
): ProductProfitability[] {
  return productProfitability
    .filter((p) => p.grossMargin < 0)
    .sort((a, b) => a.grossMargin - b.grossMargin);
}

/** Top `limit` products by gross margin. */
export function getHighProfitProducts(
  productProfitability: ProductProfitability[],
  limit = 10
): ProductProfitability[] {
  return [...productProfitability]
    .sort((a, b) => b.grossMargin - a.grossMargin)
    .slice(0, limit);
}

/**
 * High-volume products whose margin percentage is comparatively low.
 * "High sales" and "low margin" are not defined in business-rules.md, so
 * this uses a configurable, explicit threshold pair rather than an
 * invented fixed rule:
 *  - `volumePercentile`: a product must be at/above this percentile of
 *    quantitySold among the given set to count as "high sales" (default:
 *    top quartile, i.e. 0.75).
 *  - `marginPercentageThreshold`: margin % at/below which a product
 *    counts as "low margin" (default: 25%).
 * Both should be reviewed/tuned once real menu-mix expectations exist.
 */
export function getHighSalesLowMarginProducts(
  productProfitability: ProductProfitability[],
  options: { volumePercentile?: number; marginPercentageThreshold?: number } = {}
): ProductProfitability[] {
  const { volumePercentile = 0.75, marginPercentageThreshold = 25 } = options;

  if (productProfitability.length === 0) return [];

  const sortedByVolume = [...productProfitability].sort(
    (a, b) => a.quantitySold - b.quantitySold
  );
  const cutoffIndex = Math.floor(sortedByVolume.length * volumePercentile);
  const volumeThreshold = sortedByVolume[Math.min(cutoffIndex, sortedByVolume.length - 1)]
    .quantitySold;

  return productProfitability
    .filter(
      (p) => p.quantitySold >= volumeThreshold && p.marginPercentage <= marginPercentageThreshold
    )
    .sort((a, b) => b.quantitySold - a.quantitySold);
}

/**
 * Low-volume products whose margin percentage is also comparatively low —
 * the counterpart to `getHighSalesLowMarginProducts`, using the same
 * threshold-pair convention (not a different methodology):
 *  - `volumePercentile`: a product must be at/below this percentile of
 *    quantitySold among the given set to count as "low sales" (default:
 *    bottom quartile, i.e. 0.25 — the mirror of the 0.75 top-quartile
 *    default used for "high sales").
 *  - `marginPercentageThreshold`: margin % at/below which a product
 *    counts as "low margin" (default: 25%, same default as the high-sales
 *    counterpart).
 * As with `getHighSalesLowMarginProducts`, business-rules.md does not
 * define this metric — both parameters are explicit and overridable.
 */
export function getLowSalesLowMarginProducts(
  productProfitability: ProductProfitability[],
  options: { volumePercentile?: number; marginPercentageThreshold?: number } = {}
): ProductProfitability[] {
  const { volumePercentile = 0.25, marginPercentageThreshold = 25 } = options;

  if (productProfitability.length === 0) return [];

  const sortedByVolume = [...productProfitability].sort(
    (a, b) => a.quantitySold - b.quantitySold
  );
  const cutoffIndex = Math.max(Math.ceil(sortedByVolume.length * volumePercentile) - 1, 0);
  const volumeThreshold = sortedByVolume[cutoffIndex].quantitySold;

  return productProfitability
    .filter(
      (p) => p.quantitySold <= volumeThreshold && p.marginPercentage <= marginPercentageThreshold
    )
    .sort((a, b) => a.quantitySold - b.quantitySold);
}
