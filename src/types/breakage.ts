/**
 * Structure of mock_data/breakage.json (manual, non-food breakage of
 * crockery/utensils). `item` is free text and is NOT linked to
 * products.json.
 */
export interface Breakage {
  breakage_id: string;
  date: string;
  item: string;
  quantity: number;
  estimated_cost: number;
  department_id: string;
  reason: string;
}
