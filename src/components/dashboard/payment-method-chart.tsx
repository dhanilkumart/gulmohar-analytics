"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CHART_COLORS, ChartTooltip } from "@/components/dashboard/charts";
import { ChartCard, EmptyState } from "@/components/dashboard/ui-kit";
import { inr } from "@/lib/format";
import type { SalesByPaymentMethod } from "@/lib/analytics";

/**
 * "Payment Method Distribution" — share of net sales by payment method,
 * from the existing `getSalesByPaymentMethod(range)`. Groups are exactly
 * whatever payment methods appear in the data — none are hard-coded.
 */
export function PaymentMethodChart({ data }: { data: SalesByPaymentMethod[] }) {
  const sorted = [...data].sort((a, b) => b.netSales - a.netSales);

  return (
    <ChartCard title="Payment Method Distribution" description="Share of net sales by payment mode.">
      {sorted.length > 0 ? (
        <>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sorted}
                  dataKey="netSales"
                  nameKey="paymentMethod"
                  innerRadius={52}
                  outerRadius={78}
                  paddingAngle={3}
                  stroke="none"
                >
                  {sorted.map((entry, i) => (
                    <Cell key={entry.paymentMethod} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip formatter={(v) => inr(v)} />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-3 space-y-2">
            {sorted.map((entry, i) => (
              <li key={entry.paymentMethod} className="flex items-center gap-2 text-sm">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                />
                <span className="text-muted-foreground min-w-0 flex-1 truncate">{entry.paymentMethod}</span>
                <span className="num font-semibold">{inr(entry.netSales, { compact: true })}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyState message="No sales recorded for the selected period." />
      )}
    </ChartCard>
  );
}
