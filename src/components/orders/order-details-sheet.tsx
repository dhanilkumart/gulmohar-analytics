"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { orderAmount, orderTime } from "./orders-table";
import type { OrderDetail } from "@/types/order";

export function OrderDetailsSheet({ open, onOpenChange, order, loading, error }: {
  open: boolean; onOpenChange: (open: boolean) => void; order: OrderDetail | null; loading: boolean; error: string | null;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{order ? `Order ${order.orderId}` : "Order details"}</SheetTitle>
          <SheetDescription>Invoice summary and ordered items. All times are shown in IST.</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-4 pb-6" aria-live="polite">
          {loading && <p className="text-sm text-muted-foreground">Loading order details…</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {order && <>
            <dl className="grid grid-cols-2 gap-3">
              {[["Business date", order.businessDate], ["Time (IST)", orderTime(order.orderedAt)], ["Order type", order.orderType], ["Table", order.tableNumber], ["Payment mode", order.paymentMode], ["Status", order.status]].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-secondary p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-medium">{value || "Not available"}</dd></div>
              ))}
            </dl>
            <section className="space-y-2">
              <h3 className="font-semibold">Ordered items ({order.items.length} lines)</h3>
              <Table className="min-w-[560px]">
                <TableHeader><TableRow>{["Item", "Quantity", "Unit price", "Item total", "Tax", "Discount"].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
                <TableBody>{order.items.map(item => <TableRow key={item.id}>
                  <TableCell className="min-w-36">{item.name}</TableCell><TableCell className="num">{item.quantity ?? "Not available"}</TableCell>
                  {[item.unitPrice, item.total, item.tax, item.discount].map((value, index) => <TableCell key={index} className="num whitespace-nowrap">{orderAmount(value)}</TableCell>)}
                </TableRow>)}
                {!order.items.length && <TableRow><TableCell colSpan={6} className="text-muted-foreground">No item lines returned.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </section>
            <dl className="space-y-3 rounded-xl border p-4">
              {[["Subtotal", order.subtotal], ["Tax", order.tax], ["Discount", order.discount], ["Service charge", order.serviceCharge], ["Delivery charge", order.deliveryCharge], ["Packaging charge", order.packagingCharge], ["Rounding", order.roundOff], ["Grand total", order.total]].map(([label, value]) => (
                <div key={label} className={`flex items-center justify-between gap-4 text-sm ${label === "Grand total" ? "border-t pt-3 font-semibold" : ""}`}><dt>{label}</dt><dd className="num">{orderAmount(value)}</dd></div>
              ))}
            </dl>
          </>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
