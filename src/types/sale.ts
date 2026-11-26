/**
 * Sales order header returned by the data layer.
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
  gross_amount: number | null;
  discount: number | null;
  net_amount: number | null;
  payment_method: string;
  tax?: number | null;
}
