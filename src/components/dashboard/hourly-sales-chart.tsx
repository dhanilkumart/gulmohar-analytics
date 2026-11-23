"use client";

import { useEffect, useRef, useMemo } from "react";
import { useTheme } from "next-themes";
import * as echarts from "echarts";
import { ChartCard, EmptyState } from "@/components/dashboard/ui-kit";
import { inr, num } from "@/lib/format";
import type { HourlySales } from "@/lib/analytics";

function formatHourLabel(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour} ${period}`;
}

export function HourlySalesChart({ data }: { data: HourlySales[] }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const { resolvedTheme } = useTheme();

  const isDark = resolvedTheme === "dark";
  const hasData = data.some((point) => point.netSales > 0 || point.orderCount > 0);

  // Find peak sales hour
  const peakHourIndex = useMemo(() => {
    let maxSales = -1;
    let peakIdx = -1;
    data.forEach((point, idx) => {
      if (point.netSales > maxSales) {
        maxSales = point.netSales;
        peakIdx = idx;
      }
    });
    return maxSales > 0 ? peakIdx : -1;
  }, [data]);

  const peakPoint = peakHourIndex >= 0 ? data[peakHourIndex] : null;

  const categories = useMemo(() => data.map((d) => formatHourLabel(d.hour)), [data]);

  useEffect(() => {
    if (!chartRef.current || !hasData) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }
    const chart = chartInstance.current;

    // Design tokens matching Gulmohar theme
    const primaryColor = isDark ? "#2dd4bf" : "#0d9488"; // Brand Teal/Emerald
    const barDefaultColor = isDark ? "rgba(45, 212, 191, 0.45)" : "rgba(13, 148, 136, 0.40)";
    const peakHighlightColor = isDark ? "#38bdf8" : "#0284c7"; // Sky Blue emphasis for peak hour
    const peakGlowGradient = isDark
      ? new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: "#38bdf8" },
          { offset: 1, color: "rgba(56, 189, 248, 0.6)" },
        ])
      : new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: "#0284c7" },
          { offset: 1, color: "rgba(2, 132, 199, 0.6)" },
        ]);

    const textColor = isDark ? "#94a3b8" : "#64748b";
    const titleColor = isDark ? "#f1f5f9" : "#0f172a";
    const borderColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)";
    const tooltipBg = isDark ? "#1e293b" : "#ffffff";
    const tooltipBorder = isDark ? "#334155" : "#e2e8f0";

    const seriesData = data.map((point, idx) => {
      const isPeak = idx === peakHourIndex;
      return {
        value: point.netSales,
        orderCount: point.orderCount,
        hour: point.hour,
        itemStyle: {
          color: isPeak ? peakGlowGradient : barDefaultColor,
          borderRadius: [6, 6, 0, 0],
        },
      };
    });

    const option: echarts.EChartsOption = {
      backgroundColor: "transparent",
      grid: {
        top: 25,
        right: 15,
        bottom: 25,
        left: 10,
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
          const idx = first.dataIndex;
          const point = data[idx];
          if (!point) return "";

          const isPeak = idx === peakHourIndex;
          const label = formatHourLabel(point.hour);

          let html = `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px;">`;
          html += `<span style="font-weight:600;color:${titleColor};">${label} (IST)</span>`;
          if (isPeak) {
            html += `<span style="background:${isDark ? "rgba(56, 189, 248, 0.2)" : "rgba(2, 132, 199, 0.15)"};color:${isDark ? "#38bdf8" : "#0284c7"};padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:600;">Peak Hour</span>`;
          }
          html += `</div>`;

          html += `<div style="display:flex;flex-direction:column;gap:4px;">`;
          html += `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
            <span style="display:flex;align-items:center;gap:6px;color:${textColor};">
              <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${isPeak ? peakHighlightColor : primaryColor};"></span>
              Revenue:
            </span>
            <span style="font-weight:600;color:${titleColor};">${inr(point.netSales)}</span>
          </div>`;

          html += `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
            <span style="display:flex;align-items:center;gap:6px;color:${textColor};">
              <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#64748b;"></span>
              Orders:
            </span>
            <span style="font-weight:600;color:${titleColor};">${num(point.orderCount)}</span>
          </div>`;
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
          fontSize: 10,
          interval: 2, // Show every 3rd hour on mobile/tablet to avoid crowded labels
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
          formatter: (val: number) => inr(val, { compact: true }),
        },
      },
      series: [
        {
          name: "Hourly Revenue",
          type: "bar",
          barWidth: "60%",
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
  }, [categories, data, hasData, isDark, peakHourIndex]);

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
      title="Hourly Sales"
      description={
        peakPoint && peakPoint.netSales > 0
          ? `Peak: ${formatHourLabel(peakPoint.hour)} (${inr(peakPoint.netSales)} · ${num(peakPoint.orderCount)} orders)`
          : "Sales distribution across service hours (IST)."
      }
    >
      {hasData ? (
        <div ref={chartRef} className="h-[280px] w-full" />
      ) : (
        <EmptyState message="No sales recorded for the selected period." />
      )}
    </ChartCard>
  );
}
