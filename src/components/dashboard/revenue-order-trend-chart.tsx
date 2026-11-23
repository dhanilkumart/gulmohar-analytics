"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useTheme } from "next-themes";
import * as echarts from "echarts";
import { Button } from "@/components/ui/button";
import { ChartCard, EmptyState } from "@/components/dashboard/ui-kit";
import { inr, num } from "@/lib/format";
import { formatTrendAxisLabel } from "@/components/dashboard/charts";
import type { TrendGranularity } from "@/lib/analytics/date-range";

export interface SalesPerformancePoint {
  period: string;
  netSales: number;
  orderCount: number;
}

export interface RevenueOrderTrendChartProps {
  data: SalesPerformancePoint[];
  comparisonData?: SalesPerformancePoint[];
  granularity?: TrendGranularity;
  comparisonLabel?: string;
}

export function RevenueOrderTrendChart({
  data,
  comparisonData,
  granularity = "day",
  comparisonLabel,
}: RevenueOrderTrendChartProps) {
  const [metric, setMetric] = useState<"netSales" | "orderCount">("netSales");
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const { resolvedTheme } = useTheme();

  const isDark = resolvedTheme === "dark";
  const hasData = data.some((point) => point.netSales > 0 || point.orderCount > 0);

  // Period labels
  const categories = useMemo(
    () => data.map((d) => formatTrendAxisLabel(d.period, granularity)),
    [data, granularity]
  );

  const currentValues = useMemo(
    () => data.map((d) => (metric === "netSales" ? d.netSales : d.orderCount)),
    [data, metric]
  );

  const previousValues = useMemo(() => {
    if (!comparisonData || comparisonData.length === 0) return null;
    return comparisonData.map((d) => (metric === "netSales" ? d.netSales : d.orderCount));
  }, [comparisonData, metric]);

  useEffect(() => {
    if (!chartRef.current || !hasData) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }
    const chart = chartInstance.current;

    const primaryColor = isDark ? "#2dd4bf" : "#0d9488"; // Teal/Emerald matching palette
    const primaryAreaColor = isDark
      ? new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: "rgba(45, 212, 191, 0.35)" },
          { offset: 1, color: "rgba(45, 212, 191, 0.00)" },
        ])
      : new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: "rgba(13, 148, 136, 0.28)" },
          { offset: 1, color: "rgba(13, 148, 136, 0.00)" },
        ]);

    const compColor = isDark ? "rgba(148, 163, 184, 0.6)" : "rgba(100, 116, 139, 0.6)";

    const textColor = isDark ? "#94a3b8" : "#64748b";
    const titleColor = isDark ? "#f1f5f9" : "#0f172a";
    const borderColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)";
    const tooltipBg = isDark ? "#1e293b" : "#ffffff";
    const tooltipBorder = isDark ? "#334155" : "#e2e8f0";

    const series: echarts.SeriesOption[] = [
      {
        name: metric === "netSales" ? "Current Period Sales" : "Current Period Orders",
        type: "line",
        smooth: true,
        showSymbol: data.length <= 31,
        symbolSize: 6,
        data: currentValues,
        itemStyle: { color: primaryColor },
        lineStyle: { width: 2.5, color: primaryColor },
        areaStyle: { color: primaryAreaColor },
      },
    ];

    if (previousValues) {
      series.push({
        name: comparisonLabel ?? "Previous Period",
        type: "line",
        smooth: true,
        showSymbol: false,
        data: previousValues,
        itemStyle: { color: compColor },
        lineStyle: { width: 1.5, type: "dashed", color: compColor },
      });
    }

    const option: echarts.EChartsOption = {
      backgroundColor: "transparent",
      grid: {
        top: 25,
        right: 15,
        bottom: 30,
        left: 10,
        containLabel: true,
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        borderWidth: 1,
        padding: [10, 14],
        textStyle: {
          color: titleColor,
          fontSize: 12,
        },
        extraCssText: "border-radius: 0.75rem; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.2);",
        formatter: (params: unknown) => {
          if (!Array.isArray(params) || params.length === 0) return "";
          const first = params[0] as { dataIndex: number; name: string };
          const idx = first.dataIndex;
          const point = data[idx];
          if (!point) return "";

          let html = `<div style="font-weight:600;margin-bottom:6px;color:${titleColor};">${first.name} (${point.period})</div>`;
          html += `<div style="display:flex;flex-direction:column;gap:4px;">`;
          html += `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
            <span style="display:flex;align-items:center;gap:6px;color:${textColor};">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${primaryColor};"></span>
              Net Revenue:
            </span>
            <span style="font-weight:600;color:${titleColor};">${inr(point.netSales)}</span>
          </div>`;
          html += `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
            <span style="display:flex;align-items:center;gap:6px;color:${textColor};">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#38bdf8;"></span>
              Order Count:
            </span>
            <span style="font-weight:600;color:${titleColor};">${num(point.orderCount)}</span>
          </div>`;

          if (previousDataPoint(comparisonData, idx)) {
            const compPoint = comparisonData![idx];
            html += `<div style="margin-top:4px;padding-top:4px;border-top:1px dashed ${borderColor};">`;
            html += `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
              <span style="color:${compColor};font-size:11px;">Prev (${compPoint.period}):</span>
              <span style="font-weight:600;font-size:11px;color:${titleColor};">
                ${metric === "netSales" ? inr(compPoint.netSales) : num(compPoint.orderCount)}
              </span>
            </div></div>`;
          }

          html += `</div>`;
          return html;
        },
      },
      xAxis: {
        type: "category",
        data: categories,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: textColor,
          fontSize: 11,
          margin: 12,
        },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: {
          lineStyle: {
            color: borderColor,
            type: "dashed",
          },
        },
        axisLabel: {
          color: textColor,
          fontSize: 11,
          formatter: (val: number) => (metric === "netSales" ? inr(val, { compact: true }) : num(val)),
        },
      },
      series,
    };

    chart.setOption(option, true);

    const handleResize = () => {
      chart.resize();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [
    categories,
    comparisonData,
    comparisonLabel,
    currentValues,
    data,
    granularity,
    hasData,
    isDark,
    metric,
    previousValues,
  ]);

  useEffect(() => {
    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, []);

  const granularityLabel =
    granularity === "day" ? "Daily" : granularity === "week" ? "Weekly" : "Monthly";

  return (
    <ChartCard
      className="xl:col-span-2"
      title="Revenue & Order Trends"
      description={`${granularityLabel} trend across the selected period`}
      action={
        <div className="bg-secondary inline-flex rounded-xl p-1">
          {(["netSales", "orderCount"] as const).map((key) => (
            <Button
              key={key}
              variant="ghost"
              size="sm"
              onClick={() => setMetric(key)}
              className={
                "h-8 rounded-lg px-3 text-xs font-semibold shadow-none transition-all " +
                (metric === key
                  ? "bg-card text-foreground shadow-[var(--shadow-card)]"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {key === "netSales" ? "Revenue" : "Orders"}
            </Button>
          ))}
        </div>
      }
    >
      {hasData ? (
        <div ref={chartRef} className="h-[320px] w-full" />
      ) : (
        <EmptyState message="No sales recorded for the selected period." />
      )}
    </ChartCard>
  );
}

function previousDataPoint(comparisonData?: SalesPerformancePoint[], idx?: number): boolean {
  if (!comparisonData || idx === undefined) return false;
  return Boolean(comparisonData[idx]);
}
