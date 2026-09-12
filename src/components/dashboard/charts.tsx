import { format } from "date-fns";

/**
 * Shared Recharts primitives ported from ./gulmohar-analytics-ui/'s
 * src/components/app/charts.tsx (Lovable UI reference).
 *
 * Compatibility note: the main project uses Recharts 3.x; Lovable was
 * built against 2.x. In 2.x, a custom tooltip content component was
 * typed with `TooltipProps<TValue, TName>`, whose fields were all
 * optional. In 3.x, recharts' own `TooltipContentProps` marks
 * `payload`/`active`/etc. as REQUIRED (they're injected at runtime via
 * `cloneElement`, which TypeScript can't see through when the element is
 * constructed as `content={<ChartTooltip .../>}`). Rather than fight
 * that, `ChartTooltip` declares its own minimal, all-optional prop type
 * matching what recharts actually passes at runtime — it still guards
 * `!active || !payload?.length` below, so undefined/missing values are
 * handled either way.
 */

interface ChartTooltipPayloadEntry {
  name?: string | number;
  value?: number | string | readonly (string | number)[];
  color?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: readonly ChartTooltipPayloadEntry[];
  label?: string | number;
  formatter?: (value: number, name: string) => string;
}

export const AXIS = {
  stroke: "var(--color-border)",
  tick: { fill: "var(--color-muted-foreground)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

export const GRID = {
  stroke: "var(--color-border)",
  strokeDasharray: "3 3",
  vertical: false,
} as const;

export function ChartTooltip({ active, payload, label, formatter }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 shadow-[var(--shadow-pop)]">
      {label != null ? (
        <p className="mb-1.5 text-xs font-semibold text-popover-foreground">{String(label)}</p>
      ) : null}
      <div className="space-y-1">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: (entry.color as string) ?? "var(--color-chart-1)" }}
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="num ml-auto font-semibold text-popover-foreground">
              {formatter
                ? formatter(Number(entry.value), String(entry.name))
                : Number(entry.value).toLocaleString("en-IN")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

/**
 * Formats a trend `period` key (either a day or a Monday-anchored week
 * start, both "YYYY-MM-DD" — see `resolveTrendGranularity`) as a short
 * axis label. Shared across every trend chart (first introduced for the
 * Executive Dashboard's Sales Performance chart).
 */
export function formatPeriodLabel(period: string): string {
  const [year, month, day] = period.split("-").map(Number);
  return format(new Date(year, month - 1, day), "d MMM");
}
