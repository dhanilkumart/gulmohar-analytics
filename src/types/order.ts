import type { PetpoojaGetOrdersResponse } from "@/types/petpooja";

export interface OrderSummary {
  id: string;
  orderId: string;
  businessDate: string;
  orderedAt: string | null;
  orderType: string | null;
  itemCount: number;
  subtotal: string | null;
  tax: string | null;
  discount: string | null;
  total: string | null;
  paymentMode: string | null;
  status: string | null;
}

export interface OrderDetail extends OrderSummary {
  tableNumber: string | null;
  roundOff: string | null;
  serviceCharge: string | null;
  deliveryCharge: string | null;
  packagingCharge: string | null;
  items: {
    id: string;
    name: string;
    quantity: string | null;
    unitPrice: string | null;
    total: string | null;
    tax: string | null;
    discount: string | null;
  }[];
}

export interface OrdersPageData {
  orders: OrderSummary[];
  count: number;
  page: number;
  pageSize: number;
  bounds: { from: string; to: string } | null;
}

export interface PetpoojaOrdersPreview {
  requestedDate: string;
  pages: PetpoojaGetOrdersResponse[];
}
