import { ArrowDownRight, ArrowUpRight, Inbox, TriangleAlert } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

/**
 * Dashboard presentation primitives, ported from the Lovable UI's
 * src/components/app/ui-kit.tsx. These replace the earlier bare-bones
 * `MetricCard`/`ChartContainer` scaffolds (superseded — no delta/tone/
 * loading support) and are reusable across all dashboard pages, not
 * just the Executive Dashboard.
 */

export function SectionHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        <h3 className="truncate text-base font-semibold">{title}</h3>
        {description ? (
          <p className="text-muted-foreground mt-0.5 truncate text-xs">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function DeltaBadge({
  value,
  invert = false,
  label,
  className,
}: {
  value: number;
  /** When true, a negative value is good (cost, wastage). */
  invert?: boolean;
  label?: string;
  className?: string;
}) {
  const good = invert ? value <= 0 : value >= 0;
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn(
          "num inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold",
          good ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
        )}
      >
        <Icon className="h-3 w-3" />
        {`${value > 0 ? "+" : ""}${value.toFixed(1)}%`}
      </span>
      {label ? <span className="text-muted-foreground text-xs">{label}</span> : null}
    </span>
  );
}

export type Tone = "neutral" | "positive" | "warning" | "negative" | "accent";

const toneClass: Record<Tone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  positive: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  negative: "bg-danger-soft text-danger",
  accent: "bg-primary-soft text-primary",
};

export function StatusBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        toneClass[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export interface MetricCardProps {
  label: string;
  value: string;
  /** Percentage change vs. the previous period, from `comparePeriodValues`. Omit when comparison is off. */
  delta?: number;
  /** When true, a negative delta is good (cost, wastage) — matches `DeltaBadge`. */
  deltaInvert?: boolean;
  comparisonLabel?: string;
  sub?: string;
  icon?: ComponentType<{ className?: string }>;
  tone?: Tone;
  highlight?: boolean;
  loading?: boolean;
  className?: string;
}

export function MetricCard({
  label,
  value,
  delta,
  deltaInvert,
  comparisonLabel,
  sub,
  icon: Icon,
  tone = "neutral",
  highlight = false,
  loading = false,
  className,
}: MetricCardProps) {
  if (loading) {
    return (
      <div className={cn("surface-card p-5", className)}>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-4 h-8 w-32" />
        <Skeleton className="mt-3 h-4 w-20" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "surface-card group p-5 text-left transition-all duration-200",
        highlight && "bg-primary text-primary-foreground border-primary",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className={cn(
            "text-xs font-medium tracking-wide uppercase",
            highlight ? "text-primary-foreground/70" : "text-muted-foreground"
          )}
        >
          {label}
        </p>
        {Icon ? (
          <span
            className={cn(
              "grid h-8 w-8 shrink-0 place-items-center rounded-xl",
              highlight ? "bg-primary-foreground/15" : toneClass[tone]
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <p className="num mt-3 text-2xl font-bold tracking-tight lg:text-[1.7rem]">{value}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        {typeof delta === "number" ? (
          <DeltaBadge
            value={delta}
            invert={deltaInvert}
            label={highlight ? undefined : comparisonLabel}
            className={highlight ? "opacity-95" : undefined}
          />
        ) : null}
        {sub ? (
          <span
            className={cn("text-xs", highlight ? "text-primary-foreground/75" : "text-muted-foreground")}
          >
            {sub}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function ChartCard({
  title,
  description,
  action,
  footer,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("surface-card flex flex-col p-5", className)}>
      <SectionHeader title={title} description={description} action={action} />
      <div className={cn("mt-5 min-w-0 flex-1", bodyClassName)}>{children}</div>
      {footer ? <div className="border-border mt-4 border-t pt-4">{footer}</div> : null}
    </section>
  );
}

export function EmptyState({
  title = "No data available",
  message = "No data available for the selected period.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="border-border flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
      <Inbox className="text-muted-foreground h-6 w-6" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-muted-foreground max-w-xs text-xs">{message}</p>
    </div>
  );
}

export function ErrorState({
  message = "Something went wrong while loading this section.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="border-danger/40 bg-danger-soft/40 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
      <TriangleAlert className="text-danger h-6 w-6" />
      <p className="text-sm font-medium">Couldn&apos;t load data</p>
      <p className="text-muted-foreground max-w-xs text-xs">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2 rounded-lg">
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function ChartSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-64 w-full rounded-xl", className)} />;
}

export function CoverageNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground text-xs">
      <span className="bg-warning mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" />
      {children}
    </p>
  );
}
