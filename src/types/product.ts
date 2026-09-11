/**
 * Structure of mock_data/products.json.
 *
 * `preparation_type` only ever takes the two values observed in the mock
 * data ("batch" and "fresh_daily"). Only products with `preparation_type`
 * tracked in mock_data/preparation.json will have preparation/wastage
 * history — see docs/architecture.md.
 */
export type PreparationType = "batch" | "fresh_daily";

export interface Product {
  product_id: string;
  name: string;
  category_id: string;
  selling_price: number;
  food_cost: number;
  unit: string;
  active: boolean;
  gross_margin_per_unit: number;
  preparation_type: PreparationType;
}
