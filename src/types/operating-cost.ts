/**
 * Structure of mock_data/operating-costs.json.
 *
 * Observed `cost_type` values: "Utilities" | "Gas" only — this is a
 * partial variable-cost model, not a full P&L. See docs/architecture.md.
 */
export interface OperatingCost {
  date: string;
  cost_type: string;
  amount: number;
}
