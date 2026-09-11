/**
 * Structure of mock_data/sale-items.json (line items per bill).
 *
 * Note: sale items do not carry their own `date` — join to Sale via
 * `bill_id` to filter by date range.
 */
export interface SaleItem {
  sale_item_id: string;
  bill_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  amount: number;
}
