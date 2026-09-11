/**
 * Structure of mock_data/wastage.json.
 *
 * Observed `reason` values: "Over-preparation" | "End-of-day unsold".
 * Kept as `string` since more reasons are plausible in production.
 */
export interface Wastage {
  wastage_id: string;
  date: string;
  product_id: string;
  quantity: number;
  unit: string;
  reason: string;
  estimated_cost: number;
  department_id: string;
}
