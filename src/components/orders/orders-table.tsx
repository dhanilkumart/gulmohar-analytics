"use client";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { inr } from "@/lib/format";
import type { OrderDetail, OrderSummary } from "@/types/order";
import type { PetpoojaPullOrderEntry } from "@/types/petpooja";

export function orderAmount(value: string | null) {
  return value === null ? "Not available" : inr(Number(value), { decimals: 2 });
}

export function orderTime(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value)) : "Not available";
}

function decimal(value: unknown): string | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value).trim();
  return /^-?\d+(\.\d+)?$/.test(text) && Number.isFinite(Number(text)) ? text : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// A view model only: the original response pages remain untouched for Raw.
export function petpoojaOrderDetail(entry: PetpoojaPullOrderEntry, index: number): OrderDetail {
  const order = entry.Order;
  const timestamp = text(order.created_on);
  const date = timestamp && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timestamp)
    ? new Date(timestamp.replace(" ", "T") + "+05:30") : null;
  const items = entry.OrderItem ?? [];
  return {
    id: `petpooja-${index}`, orderId: String(order.orderID ?? "Not available"),
    businessDate: text(order.order_date) ?? "Not available",
    orderedAt: date && Number.isFinite(date.getTime()) ? date.toISOString() : null,
    orderType: text(order.order_type), status: text(order.status), itemCount: items.length,
    subtotal: decimal(order.core_total), tax: decimal(order.tax_total),
    discount: decimal(order.discount_total), total: decimal(order.total),
    paymentMode: [text(order.payment_type), text(order.custom_payment_type)].filter(Boolean).join(" · ") || null,
    tableNumber: text(order.table_no), roundOff: decimal(order.round_off),
    serviceCharge: decimal(order.service_charge), deliveryCharge: decimal(order.delivery_charges),
    packagingCharge: decimal(order.container_charges),
    items: items.map((item, itemIndex) => ({
      id: `item-${itemIndex}`, name: text(item.name) ?? "Not available",
      quantity: decimal(item.quantity), unitPrice: decimal(item.price), total: decimal(item.total),
      tax: decimal(item.total_tax), discount: decimal(item.total_discount),
    })),
  };
}

export function OrdersTable({ orders, count, page, pageSize, onPageChange, onSelect, pending = false }: {
  orders: OrderSummary[]; count: number; page: number; pageSize: number;
  onPageChange: (page: number) => void; onSelect: (order: OrderSummary) => void; pending?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  return (
    <div className="space-y-4" aria-busy={pending}>
      <Table className="min-w-[1180px]">
        <TableHeader><TableRow>
          {["Order ID", "Business date / time (IST)", "Type", "Line items", "Subtotal", "Tax", "Discount", "Total amount", "Payment mode", "Status"].map(label => <TableHead key={label} className="text-xs">{label}</TableHead>)}
        </TableRow></TableHeader>
        <TableBody>
          {orders.map(order => (
            <TableRow key={order.id} onClick={() => onSelect(order)} className="cursor-pointer hover:bg-secondary/70">
              <TableCell><Button variant="link" className="h-auto p-0 font-semibold" onClick={event => { event.stopPropagation(); onSelect(order); }} aria-label={`View order ${order.orderId}`}>{order.orderId}</Button></TableCell>
              <TableCell className="whitespace-nowrap"><div>{order.businessDate}</div><div className="text-xs text-muted-foreground">{orderTime(order.orderedAt)}</div></TableCell>
              <TableCell>{order.orderType || "Not available"}</TableCell>
              <TableCell className="num">{order.itemCount}</TableCell>
              {[order.subtotal, order.tax, order.discount, order.total].map((value, index) => <TableCell key={index} className="num whitespace-nowrap">{orderAmount(value)}</TableCell>)}
              <TableCell>{order.paymentMode || "Not available"}</TableCell>
              <TableCell><Badge variant="outline" className="whitespace-nowrap">{order.status || "Not available"}</Badge></TableCell>
            </TableRow>
          ))}
          {!orders.length && <TableRow><TableCell colSpan={10} className="h-24 text-center text-muted-foreground">No orders found for this selection.</TableCell></TableRow>}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="num">{count ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, count)} of ${count} orders` : "0 orders"}</span>
        <div className="flex items-center gap-2">
          <span className="num">Page {page} of {pages}</span>
          <Button variant="outline" size="sm" disabled={pending || page <= 1} onClick={() => onPageChange(page - 1)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={pending || page >= pages} onClick={() => onPageChange(page + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
