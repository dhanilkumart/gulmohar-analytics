"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inr, num, pct } from "@/lib/format";
import type { ItemPreparationWastageMetric } from "@/lib/analytics/live-wastage-prep";

export function WastageDetailTable({ rows }: { rows: ItemPreparationWastageMetric[] }) {
  if (!rows || rows.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 border-b">
        <h3 className="font-semibold text-foreground">Preparation & Wastage Summary by Item</h3>
        <p className="text-xs text-muted-foreground">Detailed breakdown of batch preparation, recorded waste, and cost valuation.</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item Code</TableHead>
            <TableHead>Preparation Item</TableHead>
            <TableHead className="text-right">Prepared Qty</TableHead>
            <TableHead className="text-right">Wasted Qty</TableHead>
            <TableHead className="text-right">Remaining Qty</TableHead>
            <TableHead className="text-right">Wastage %</TableHead>
            <TableHead className="text-right">Wastage Cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.itemId}>
              <TableCell className="font-mono text-xs text-muted-foreground">{row.itemCode}</TableCell>
              <TableCell className="font-medium text-foreground">{row.name}</TableCell>
              <TableCell className="text-right">
                {num(row.preparedQuantity)} <span className="text-xs text-muted-foreground">{row.unit}</span>
              </TableCell>
              <TableCell className="text-right font-medium text-destructive">
                {num(row.wastedQuantity)} <span className="text-xs text-muted-foreground">{row.unit}</span>
              </TableCell>
              <TableCell className="text-right">
                {num(row.remainingQuantity)} <span className="text-xs text-muted-foreground">{row.unit}</span>
              </TableCell>
              <TableCell className="text-right font-medium">
                {row.preparedQuantity > 0 ? (
                  <span className={row.wastagePercentage > 15 ? "text-destructive" : "text-foreground"}>
                    {pct(row.wastagePercentage)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right font-semibold text-foreground">
                {row.wastageCost > 0 ? inr(row.wastageCost) : <span className="text-muted-foreground text-xs">—</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
