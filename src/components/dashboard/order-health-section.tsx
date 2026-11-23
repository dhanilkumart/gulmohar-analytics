import {
  CheckCircle2,
  Gift,
  XCircle,
  Percent,
  Layers,
  Info,
} from "lucide-react";
import { num } from "@/lib/format";
import type { OrderHealthMetrics } from "@/lib/analytics";

interface OrderHealthSectionProps {
  metrics: OrderHealthMetrics;
}

export function OrderHealthSection({ metrics }: OrderHealthSectionProps) {
  const {
    totalOrders,
    successfulOrders,
    complimentaryOrders,
    cancelledOrders,
    cancellationRate,
    statusBreakdown,
  } = metrics;

  // Colors aligned with the dashboard design system
  const statusConfig: Record<
    string,
    { barColor: string; badgeColor: string; textColor: string; icon: typeof CheckCircle2 }
  > = {
    Success: {
      barColor: "bg-emerald-500 dark:bg-emerald-400",
      badgeColor: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      textColor: "text-emerald-600 dark:text-emerald-400",
      icon: CheckCircle2,
    },
    Complimentary: {
      barColor: "bg-indigo-500 dark:bg-indigo-400",
      badgeColor: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
      textColor: "text-indigo-600 dark:text-indigo-400",
      icon: Gift,
    },
    Cancelled: {
      barColor: "bg-rose-500 dark:bg-rose-400",
      badgeColor: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
      textColor: "text-rose-600 dark:text-rose-400",
      icon: XCircle,
    },
  };

  const defaultConfig = {
    barColor: "bg-muted-foreground",
    badgeColor: "bg-muted text-muted-foreground border-border",
    textColor: "text-muted-foreground",
    icon: Info,
  };

  return (
    <div className="surface-card rounded-xl border p-4 sm:p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            Order Health & Fulfillment
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Operational status distribution across all placed orders in this period
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <span className="text-xs text-muted-foreground">
            Total Ingested: <strong className="text-foreground num">{num(totalOrders)}</strong>
          </span>
        </div>
      </div>

      {/* Segmented Status Distribution Bar */}
      {totalOrders > 0 ? (
        <div className="space-y-2">
          <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden flex">
            {statusBreakdown.map((item) => {
              const cfg = statusConfig[item.status] || defaultConfig;
              if (item.count === 0) return null;
              return (
                <div
                  key={item.status}
                  className={`h-full transition-all duration-300 ${cfg.barColor}`}
                  style={{ width: `${item.percentage}%` }}
                  title={`${item.label}: ${item.count} (${item.percentage}%)`}
                />
              );
            })}
          </div>

          {/* Inline Legend with Percentages */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-xs">
            {statusBreakdown.map((item) => {
              const cfg = statusConfig[item.status] || defaultConfig;
              return (
                <div key={item.status} className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${cfg.barColor} shrink-0`} />
                  <span className="text-muted-foreground font-medium">{item.label}:</span>
                  <span className="font-semibold text-foreground num">{num(item.count)}</span>
                  <span className="text-muted-foreground text-[11px] num">({item.percentage}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="h-2 w-full rounded-full bg-muted" />
      )}

      {/* Compact Stat Cards Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 pt-1">
        {/* Successful Orders */}
        <div className="rounded-lg border bg-background/50 p-3 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Successful</span>
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          </div>
          <div className="text-xl font-bold num text-foreground">
            {num(successfulOrders)}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Revenue-generating orders
          </div>
        </div>

        {/* Complimentary Orders */}
        <div className="rounded-lg border bg-background/50 p-3 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Complimentary</span>
            <Gift className="h-3.5 w-3.5 text-indigo-500" />
          </div>
          <div className="text-xl font-bold num text-foreground">
            {num(complimentaryOrders)}
          </div>
          <div className="text-[11px] text-muted-foreground">
            100% comp / operational
          </div>
        </div>

        {/* Cancelled Orders */}
        <div className="rounded-lg border bg-background/50 p-3 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Cancelled</span>
            <XCircle className="h-3.5 w-3.5 text-rose-500" />
          </div>
          <div className="text-xl font-bold num text-foreground">
            {num(cancelledOrders)}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Excluded from sales
          </div>
        </div>

        {/* Cancellation Rate */}
        <div className="rounded-lg border bg-background/50 p-3 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Cancellation Rate</span>
            <Percent className="h-3.5 w-3.5 text-warning" />
          </div>
          <div className="text-xl font-bold num text-foreground">
            {cancellationRate}%
          </div>
          <div className="text-[11px] text-muted-foreground">
            Of total placed orders
          </div>
        </div>
      </div>
    </div>
  );
}

