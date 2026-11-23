"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useTheme } from "next-themes";
import * as echarts from "echarts";
import { Button } from "@/components/ui/button";
import { ChartCard, EmptyState } from "@/components/dashboard/ui-kit";
import { inr, num } from "@/lib/format";
import type { ItemSalesRanking } from "@/lib/analytics";

export function TopSellingItemsChart({ data }: { data: ItemSalesRanking[] }) {
  const [metric, setMetric] = useState<"revenue" | "quantitySold">("revenue");
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const { resolvedTheme } = useTheme();

  const isDark = resolvedTheme === "dark";
  const hasData = data && data.length > 0;

  // Top 10 items sorted based on selected metric
  // For horizontal bar chart in ECharts, we reverse the array so the top #1 item appears at the TOP of the Y-axis.
  const top10 = useMemo(() => {
    if (!data || data.length === 0) return [];
    const sorted = [...data]
      .sort((a, b) => (metric === "revenue" ? b.revenue - a.revenue : b.quantitySold - a.quantitySold))
      .slice(0, 10);
    return sorted.reverse();
  }, [data, metric]);

  const itemNames = useMemo(() => top10.map((d) => d.itemName), [top10]);
  const values = useMemo(
    () => top10.map((d) => (metric === "revenue" ? d.revenue : d.quantitySold)),
    [top10, metric]
  );

  useEffect(() => {
    if (!chartRef.current || !hasData || top10.length === 0) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }
    const chart = chartInstance.current;

    const primaryColor = isDark ? "#2dd4bf" : "#0d9488"; // Brand Teal
    const barGradient = isDark
      ? new echarts.graphic.LinearGradient(1, 0, 0, 0, [
          { offset: 0, color: "#2dd4bf" },
          { offset: 1, color: "rgba(45, 212, 191, 0.4)" },
        ])
      : new echarts.graphic.LinearGradient(1, 0, 0, 0, [
          { offset: 0, color: "#0d9488" },
          { offset: 1, color: "rgba(13, 148, 136, 0.4)" },
        ]);

    const textColor = isDark ? "#94a3b8" : "#64748b";
    const titleColor = isDark ? "#f1f5f9" : "#0f172a";
    const borderColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)";
    const tooltipBg = isDark ? "#1e293b" : "#ffffff";
    const tooltipBorder = isDark ? "#334155" : "#e2e8f0";

    const option: echarts.EChartsOption = {
      backgroundColor: "transparent",
      grid: {
        top: 15,
        right: 35,
        bottom: 25,
        left: 15,
        containLabel: true,
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "shadow",
          shadowStyle: {
            color: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.03)",
          },
        },
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
          const first = params[0] as { dataIndex: number };
          const item = top10[first.dataIndex];
          if (!item) return "";

          let html = `<div style="font-weight:600;margin-bottom:6px;color:${titleColor};">${item.itemName}</div>`;
          html += `<div style="display:flex;flex-direction:column;gap:4px;">`;
          html += `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
            <span style="display:flex;align-items:center;gap:6px;color:${textColor};">
              <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${primaryColor};"></span>
              Revenue:
            </span>
            <span style="font-weight:600;color:${titleColor};">${inr(item.revenue)}</span>
          </div>`;
          html += `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
            <span style="display:flex;align-items:center;gap:6px;color:${textColor};">
              <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#38bdf8;"></span>
              Quantity Sold:
            </span>
            <span style="font-weight:600;color:${titleColor};">${num(item.quantitySold)}</span>
          </div>`;
          html += `</div>`;

          return html;
        },
      },
      xAxis: {
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
          formatter: (val: number) => (metric === "revenue" ? inr(val, { compact: true }) : num(val)),
        },
      },
      yAxis: {
        type: "category",
        data: itemNames,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: titleColor,
          fontSize: 11,
          width: 140,
          overflow: "truncate",
        },
      },
      series: [
        {
          name: metric === "revenue" ? "Revenue" : "Quantity Sold",
          type: "bar",
          data: values,
          barWidth: "60%",
          itemStyle: {
            color: barGradient,
            borderRadius: [0, 6, 6, 0],
          },
          label: {
            show: true,
            position: "right",
            color: textColor,
            fontSize: 10,
            formatter: (params: { value: unknown }) =>
              metric === "revenue" ? inr(Number(params.value), { compact: true }) : num(Number(params.value)),
          },
        },
      ],
    };

    chart.setOption(option, true);

    const handleResize = () => {
      chart.resize();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [hasData, isDark, itemNames, metric, top10, values]);

  useEffect(() => {
    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, []);

  return (
    <ChartCard
      className="xl:col-span-2"
      title="Top-Selling Items"
      description="Best performing menu items across the selected period."
      action={
        <div className="bg-secondary inline-flex rounded-xl p-1">
          {(["revenue", "quantitySold"] as const).map((key) => (
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
              {key === "revenue" ? "Revenue" : "Quantity"}
            </Button>
          ))}
        </div>
      }
    >
      {hasData ? (
        <div ref={chartRef} className="h-[340px] w-full" />
      ) : (
        <EmptyState message="No item sales data available for the selected period." />
      )}
    </ChartCard>
  );
}

