"use client";

import { useEffect, useRef, useMemo } from "react";
import { useTheme } from "next-themes";
import * as echarts from "echarts";
import { ChartCard, EmptyState } from "@/components/dashboard/ui-kit";
import { inr, num } from "@/lib/format";
import type { SalesByOrderType } from "@/lib/analytics";

export function OrderTypeChart({ data }: { data: SalesByOrderType[] }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const { resolvedTheme } = useTheme();

  const isDark = resolvedTheme === "dark";

  // Filter out any zero entries and sort descending by orderCount
  const validData = useMemo(() => {
    return data.filter((item) => item.orderCount > 0 || item.netSales > 0);
  }, [data]);

  const hasData = validData.length > 0;

  const totalOrders = useMemo(() => {
    return validData.reduce((sum, item) => sum + item.orderCount, 0);
  }, [validData]);

  const totalRevenue = useMemo(() => {
    return validData.reduce((sum, item) => sum + item.netSales, 0);
  }, [validData]);

  useEffect(() => {
    if (!chartRef.current || !hasData) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }
    const chart = chartInstance.current;

    // Palette matching Gulmohar Brand (Primary Teal, Accent Sky Blue, Gold Amber, Muted)
    const colorPalette = isDark
      ? ["#2dd4bf", "#38bdf8", "#fbbf24", "#a78bfa"]
      : ["#0d9488", "#0284c7", "#d97706", "#7c3aed"];

    const textColor = isDark ? "#94a3b8" : "#64748b";
    const titleColor = isDark ? "#f1f5f9" : "#0f172a";
    const tooltipBg = isDark ? "#1e293b" : "#ffffff";
    const tooltipBorder = isDark ? "#334155" : "#e2e8f0";

    const seriesData = validData.map((item, idx) => ({
      name: item.orderType,
      value: item.orderCount,
      netSales: item.netSales,
      itemStyle: {
        color: colorPalette[idx % colorPalette.length],
      },
    }));

    const option: echarts.EChartsOption = {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
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
          const item = params as {
            name: string;
            value: number;
            percent: number;
            data: { netSales: number };
            color: string;
          };
          const revenueShare = totalRevenue > 0 ? (item.data.netSales / totalRevenue) * 100 : 0;

          let html = `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">`;
          html += `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color};"></span>`;
          html += `<span style="font-weight:600;color:${titleColor};">${item.name}</span>`;
          html += `</div>`;

          html += `<div style="display:flex;flex-direction:column;gap:4px;">`;
          html += `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
            <span style="color:${textColor};">Orders:</span>
            <span style="font-weight:600;color:${titleColor};">${num(item.value)} (${item.percent.toFixed(1)}%)</span>
          </div>`;

          html += `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
            <span style="color:${textColor};">Revenue:</span>
            <span style="font-weight:600;color:${titleColor};">${inr(item.data.netSales)} (${revenueShare.toFixed(1)}%)</span>
          </div>`;
          html += `</div>`;

          return html;
        },
      },
      legend: {
        orient: "horizontal",
        bottom: 0,
        textStyle: {
          color: textColor,
          fontSize: 11,
        },
        formatter: (name: string) => {
          const entry = validData.find((d) => d.orderType === name);
          if (!entry || totalOrders === 0) return name;
          const percentage = ((entry.orderCount / totalOrders) * 100).toFixed(1);
          return `${name}: ${num(entry.orderCount)} (${percentage}%)`;
        },
      },
      series: [
        {
          name: "Order Type",
          type: "pie",
          radius: ["48%", "72%"],
          center: ["50%", "44%"],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 6,
            borderColor: isDark ? "#0f172a" : "#ffffff",
            borderWidth: 2,
          },
          label: {
            show: false,
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 13,
              fontWeight: "bold",
              formatter: "{b}\n{d}%",
              color: titleColor,
            },
            scaleSize: 6,
          },
          data: seriesData,
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
  }, [isDark, hasData, validData, totalOrders, totalRevenue]);

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
      title="Sales by Order Type"
      description="Distribution between dine-in and delivery services."
    >
      {hasData ? (
        <div ref={chartRef} className="h-[280px] w-full" />
      ) : (
        <EmptyState message="No order type data available for the selected period." />
      )}
    </ChartCard>
  );
}
