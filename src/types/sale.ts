/**
 * Structure of mock_data/sales.json (bill/order headers).
 *
 * Observed `order_type` values: "Dine-in" | "Delivery" | "Takeaway".
 * Observed `payment_method` values: "Cash" | "Card" | "UPI".
 * Kept as `string` rather than a literal union so a real backend can add
 * new values (e.g. a new payment method) without breaking these types.
 */
export interface Sale {
  bill_id: string;
  date: string;
  time: string;
  order_type: string;
  gross_amount: number;
  discount: number;
  net_amount: number;
  payment_method: string;
}
