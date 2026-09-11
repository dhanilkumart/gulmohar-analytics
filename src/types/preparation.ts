/**
 * Structure of mock_data/preparation.json.
 *
 * Only present for the subset of products the mock data tracks
 * preparation for (8 of 60 products) — see docs/architecture.md.
 */
export interface Preparation {
  date: string;
  product_id: string;
  prepared_quantity: number;
  sold_quantity: number;
  wasted_quantity: number;
  preparation_unit: string;
}
