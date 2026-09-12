"use client";

import {
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { AXIS, GRID } from "@/components/dashboard/charts";
import { ChartCard, EmptyState } from "@/components/dashboard/ui-kit";
import { inr, num, pct } from "@/lib/format";
import type { ProductProfitability } from "@/lib/analytics";

export type ProfitabilityClassification =
  | "Loss-Making"
  | "High Sales / Low Margin"
  | "Low Sales / Low Margin"
  | "Other";

const CLASSIFICATION_COLOR: Record<ProfitabilityClassification, string> = {
  "Loss-Making": "var(--color-chart-4)",
  "High Sales / Low Margin": "var(--color-chart-2)",
  "Low Sales / Low Margin": "var(--color-chart-3)",
  Other: "var(--color-chart-1)",
};

export interface ProfitabilityMatrixPoint {
  product: ProductProfitability;
  classification: ProfitabilityClassification;
}

/**
 * "Profitability Matrix" — quantity sold vs. margin %, bubble size =
 * revenue, from the existing `getProductProfitability()` result.
 *
 * Lovable's original chart drew quadrant `ReferenceLine`s at a fixed
 * qty of 1400 and a fixed margin of 45% — both values invented for that
 * mock UI, present nowhere in `mock_data/business-rules.md` or the
 * analytics layer (and inconsistent with the 25%-margin/quartile-volume
 * definition `getHighSalesLowMarginProducts` actually uses). Per this
 * step's instructions, those fabricated split lines were NOT ported.
 * Instead, each point is colored by which *existing* classification
 * function it actually appears in (`classification`, computed
 * server-side in the page from `getLossMakingProducts`/
 * `getHighSalesLowMarginProducts`/`getLowSalesLowMarginProducts`) — a
 * real result, not an invented axis split.
 */
export function ProfitabilityMatrixChart({ data }: { data: ProfitabilityMatrixPoint[] }) {
  const points = data.map(({ product, classification }) => ({
    productId: product.productId,
    name: product.name,
    x: product.quantitySold,
    y: Number(product.marginPercentage.toFixed(1)),
    z: product.revenue,
    classification,
  }));

  return (
    <ChartCard
      title="Profitability Matrix"
      description="Sales volume against margin percentage. Bubble size represents revenue."
    >
      {points.length > 0 ? (
        <>
          <div className="h-[380px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ left: 4, right: 16, top: 12, bottom: 12 }}>
                <CartesianGrid {...GRID} vertical />
                <XAxis type="number" dataKey="x" name="Quantity Sold" {...AXIS} tickFormatter={(v: number) => num(v)} />
                <YAxis type="number" dataKey="y" name="Margin %" {...AXIS} width={48} unit="%" />
                <ZAxis type="number" dataKey="z" range={[60, 420]} />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const point = payload[0]?.payload as (typeof points)[number] | undefined;
                    if (!point) return null;
                    return (
                      <div className="border-border bg-popover rounded-xl border px-3 py-2 shadow-[var(--shadow-pop)]">
                        <p className="text-xs font-semibold">{point.name}</p>
                        <p className="num text-muted-foreground mt-1 text-xs">Qty sold: {num(point.x)}</p>
                        <p className="num text-muted-foreground text-xs">Revenue: {inr(point.z)}</p>
                        <p className="num text-muted-foreground text-xs">Margin: {pct(point.y)}</p>
                        <p className="text-muted-foreground text-xs">{point.classification}</p>
                      </div>
                    );
                  }}
                />
                <Scatter data={points} name="Products">
                  {points.map((point) => (
                    <Cell key={point.productId} fill={CLASSIFICATION_COLOR[point.classification]} fillOpacity={0.85} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="text-muted-foreground mt-4 flex flex-wrap gap-3 text-xs">
            {(Object.keys(CLASSIFICATION_COLOR) as ProfitabilityClassification[]).map((key) => (
              <span key={key} className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: CLASSIFICATION_COLOR[key] }}
                />
                {key}
              </span>
            ))}
          </div>
        </>
      ) : (
        <EmptyState message="No products sold in the selected period." />
      )}
    </ChartCard>
  );
}
