/**
 * Structure of mock_data/recipes.json.
 *
 * Only 5 of 60 products have recipe rows in the mock data — this is a
 * partial bill-of-materials sample, not a full ingredient breakdown for
 * every product. See docs/architecture.md.
 */
export interface Recipe {
  product_id: string;
  ingredient_id: string;
  quantity_per_unit: number;
}
