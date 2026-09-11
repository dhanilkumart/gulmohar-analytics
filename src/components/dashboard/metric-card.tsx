import type { ReactNode } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface MetricCardProps {
  label: string;
  value: ReactNode;
  description?: string;
}

/**
 * Reusable stat-tile foundation for KPI-style numbers (e.g. net sales,
 * order count). Dashboard pages compose this with real analytics values —
 * it renders no data of its own.
 */
export function MetricCard({ label, value, description }: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="gap-1">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums">{value}</CardTitle>
        {description ? (
          <p className="text-muted-foreground text-xs">{description}</p>
        ) : null}
      </CardHeader>
    </Card>
  );
}
