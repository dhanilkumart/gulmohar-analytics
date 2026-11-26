/**
 * Sales order line item returned by the data layer.
 */
export interface SaleItem {
  sale_item_id: string;
  date: string; // YYYY-MM-DD, from the parent order
  bill_id: string;
  product_id: string;
  item_name?: string;
  product_name?: string;
  quantity: number;
  unit_price: number;
  amount: number;
}
