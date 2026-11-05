/**
 * TypeScript definitions for Petpooja Global API (Webhook push)
 * and Petpooja Get Orders API (Pull-based historical retrieval).
 *
 * Based strictly on Petpooja's official technical documentation:
 * - "Global API Documentation" (Webhook)
 * - "Get Orders API Documentation" (Pull API)
 *
 * Keep schemas separate to account for differences between the push and pull models.
 */

// ============================================================================
// 1. PETPOOJA GLOBAL API (Push Webhook) TYPES
// ============================================================================

export interface PetpoojaGlobalRestaurant {
  res_name: string;
  address: string;
  contact_information: string;
  restID: string;
}

export interface PetpoojaGlobalCustomer {
  name: string;
  address: string;
  phone: string;
  gstin?: string;
}

export interface PetpoojaGlobalPartPayment {
  payment_type: string;
  amount: number | string;
  custome_payment_type?: string;
}

export interface PetpoojaGlobalOrder {
  orderID: number | string;
  customer_invoice_id: string;
  delivery_charges: number | string;
  order_type: "Dine In" | "Pick Up" | "Delivery" | string;
  payment_type: "Cash" | "Card" | "Online" | "Other" | "Part Payment" | string;
  table_no?: string;
  no_of_persons?: number | string;
  discount_total: number | string;
  tax_total: number | string;
  round_off: string;
  core_total: number | string;
  total: number | string;
  created_on: string;
  order_from: "POS" | "Zomato" | "Swiggy" | string;
  order_from_id?: string;
  sub_order_type?: string;
  packaging_charge?: number | string;
  status: "Success" | "Cancelled" | string;
  token_no?: string;
  comment?: string;
  service_charge?: number | string;
  biller?: string;
  assignee?: string;
  part_payments?: PetpoojaGlobalPartPayment[];
}

export interface PetpoojaGlobalTax {
  title: string;
  type: "P" | "F" | string; // Percentage or Fixed
  rate: number | string;
  amount: number | string;
}

export interface PetpoojaGlobalDiscount {
  title: string;
  type: "P" | "F" | string;
  rate: number | string;
  amount: number | string;
}

export interface PetpoojaGlobalAddon {
  group_name?: string;
  name?: string;
  price?: number | string;
  quantity?: number | string;
  sap_code?: string;
  addon_id?: string;
  addon_group_id?: string;
}

export interface PetpoojaGlobalItemTaxDetail {
  value: number | string;
  name: string;
}

export interface PetpoojaGlobalItemTaxInfo {
  tax?: Record<string, PetpoojaGlobalItemTaxDetail>;
  tax_i?: Record<string, PetpoojaGlobalItemTaxDetail>;
  total_tax_i?: number | string;
}

export interface PetpoojaGlobalOrderItem {
  name: string;
  itemid: number | string;
  itemcode: string;
  vendoritemcode?: string;
  specialnotes?: string;
  price: number | string;
  quantity: number | string;
  total: number | string;
  addon?: PetpoojaGlobalAddon[];
  category_name?: string;
  sap_code?: string;
  discount?: number | string;
  tax?: number | string;
  item_tax_info?: PetpoojaGlobalItemTaxInfo;
}

export interface PetpoojaGlobalPayload {
  token?: string;
  Token?: string; // Some aggregator payloads use capitalized "Token"
  event: "orderdetails" | string;
  properties: {
    Restaurant: PetpoojaGlobalRestaurant;
    Customer: PetpoojaGlobalCustomer;
    Order: PetpoojaGlobalOrder;
    Tax?: PetpoojaGlobalTax[];
    Discount?: PetpoojaGlobalDiscount[];
    OrderItem: PetpoojaGlobalOrderItem[];
  };
}

export interface PetpoojaWebhookSuccessResponse {
  status: "success";
  message: string;
  order_id?: string | number;
}

export interface PetpoojaWebhookErrorResponse {
  status: "error";
  message: string;
  details?: string[];
}

// ============================================================================
// 2. PETPOOJA GET ORDERS API (Pull Model) TYPES
// ============================================================================

export interface PetpoojaGetOrdersRequest {
  app_key: string;
  app_secret: string;
  access_token: string;
  restID: string;
  /**
   * T-1 query date in format "YYYY-MM-DD".
   * Passing 2026-03-16 returns complete orders for 2026-03-15 after business day closes.
   */
  order_date: string;
  /**
   * Identifier used for pagination/batch retrieval.
   * Pass empty string "" for the initial call.
   */
  refId?: string;
}

export interface PetpoojaPullRestaurant {
  restaurantid: string;
  res_name: string;
  address: string;
  restaurant_state?: string;
  contact_information: string;
  restID: string;
}

export interface PetpoojaPullCustomer {
  name: string;
  address: string;
  phone: string;
  gst_no?: string;
  created_date?: string;
}

export interface PetpoojaPullOrder {
  orderID: string;
  refId: string;
  delivery_charges: string;
  container_charges?: string;
  order_type: string;
  sub_order_type_id?: string;
  sub_order_type?: string;
  payment_type: string;
  custom_payment_type?: string;
  table_no?: string;
  no_of_persons?: string;
  discount_total: string;
  tax_total: string;
  round_off: string;
  core_total: string;
  total: string;
  created_on: string;
  order_from: string;
  advance_order?: string;
  part_payment?: Array<{
    payment_type: string;
    amount: string;
    custom_payment_type?: string;
  }>;
  order_date: string;
  status: "Success" | "Cancelled" | string;
  service_charge?: number | string;
  waivedOff?: string;
  tip?: string;
  is_food_res?: string;
  online_order_id?: string;
  cancel_order_description?: string;
  biller_name?: string;
  group_ids?: number | string;
  group_names?: string;
  fa_name?: string; // Assignee Name
}

export interface PetpoojaPullTaxItem {
  title: string;
  type: string;
  rate: string;
  amount: string;
  taxid?: string | number;
  taxontaxids?: string;
}

export interface PetpoojaPullDiscountItem {
  title: string;
  type: string;
  rate: string;
  amount: string;
  discountid?: number | string;
}

export interface PetpoojaPullOrderItem {
  categoryid?: string;
  categoryname?: string;
  name: string;
  itemid: string;
  itemcode: string;
  specialnotes?: string;
  price: string;
  quantity: string;
  total: string;
  addon?: Array<{
    addonid?: string;
    group_name?: string;
    name?: string;
    price?: number | string;
    quantity?: string;
    addon_sap_code?: string;
  }>;
  item_tax_info?: {
    tax?: Record<string, { value: number; name: string }>;
    tax_i?: Record<string, { value: number; name: string }>;
    total_tax_i?: number;
  };
  total_discount?: number | string;
  total_tax?: number | string;
  tax_ids?: string;
  itemsapcode?: string;
  item_hsn_code?: string;
  is_upsell_combo?: string;
  combo_discount?: string;
  combo_parent_item_id?: string;
}

export interface PetpoojaPullOrderEntry {
  Restaurant: PetpoojaPullRestaurant;
  Customer: PetpoojaPullCustomer;
  Order: PetpoojaPullOrder;
  Tax?: PetpoojaPullTaxItem[];
  Discount?: PetpoojaPullDiscountItem[];
  OrderItem: PetpoojaPullOrderItem[];
}

export interface PetpoojaGetOrdersResponse {
  code: string; // e.g. "200"
  success: string; // "1" for success, "0" for failure
  message: string;
  order_json?: PetpoojaPullOrderEntry[];
}

