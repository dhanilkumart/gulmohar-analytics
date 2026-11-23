"use client";

import React, { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { formatTrendAxisLabel } from "@/components/dashboard/charts";
import { inr, num } from "@/lib/format";

export type MiniChartType = "area-line" | "bar" | "line";
export type ValueFormatterType = "currency" | "orders" | "items" | "number";

export interface KpiDataPoint {
  date: string;
  value: number;
}

export interface KpiMiniChartProps {
  data: KpiDataPoint[];
  type: MiniChartType;
  label: string;
  valueType?: ValueFormatterType;
  className?: string;
}

function formatTooltipValue(val: number, type: ValueFormatterType = "number"): string {
  switch (type) {
    case "currency":
      return inr(val);
    case "orders":
      return `${num(val)} orders`;
    case "items":
      return `${num(val)} items`;
    case "number":
    default:
      return num(val);
  }
}

/**
 * Interactive ECharts-based Sparkline Mini Chart for KPI Cards:
 * - 40–45% of card width
 * - White line/bars with subtle transparency for area/bars
 * - Interactive mouse hover with custom compact tooltip & indicator
 * - Smooth initial and date-range transition animations
 * - Proper instance update & disposal lifecycle
 */
export function KpiMiniChart({
  data,
  type,
  label,
  valueType = "number",
  className,
}: KpiMiniChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  const validData = data && data.length > 0;
  const hasVariation = validData && data.some((d) => d.value > 0);

  useEffect(() => {
    if (!chartRef.current) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, undefined, {
        renderer: "svg", // SVG renderer is optimal & crisp for small sparklines
      });
    }

    const chart = chartInstance.current;

    // Check reduced motion preference
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const dates = data.map((d) => d.date);
    const values = data.map((d) => d.value);

    // Formatted date labels for tooltip
    const formattedDates = dates.map((d) => {
      try {
        return formatTrendAxisLabel(d, "day");
      } catch {
        return d;
      }
    });

    const isArea = type === "area-line";
    const isBar = type === "bar";

    const seriesOption: echarts.SeriesOption = isBar
      ? {
          name: label,
          type: "bar",
          data: values,
          barCategoryGap: "35%",
          itemStyle: {
            color: "rgba(255, 255, 255, 0.65)",
            borderRadius: [2, 2, 0, 0],
          },
          emphasis: {
            itemStyle: {
              color: "#ffffff",
              shadowBlur: 4,
              shadowColor: "rgba(255, 255, 255, 0.4)",
            },
          },
          animation: !prefersReducedMotion,
          animationDuration: 600,
          animationEasing: "cubicOut",
        }
      : {
          name: label,
          type: "line",
          smooth: true,
          data: values,
          showSymbol: false,
          symbol: "circle",
          symbolSize: 6,
          itemStyle: {
            color: "#ffffff",
          },
          lineStyle: {
            width: 2,
            color: "#ffffff",
            shadowColor: "rgba(0, 0, 0, 0.15)",
            shadowBlur: 2,
          },
          emphasis: {
            scale: 1.4,
            itemStyle: {
              color: "#ffffff",
              borderColor: "rgba(255, 255, 255, 0.4)",
              borderWidth: 3,
            },
          },
          areaStyle: isArea
            ? {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: "rgba(255, 255, 255, 0.35)" },
                  { offset: 1, color: "rgba(255, 255, 255, 0.02)" },
                ]),
              }
            : undefined,
          animation: !prefersReducedMotion,
          animationDuration: 650,
          animationEasing: "cubicOut",
        };

    const option: echarts.EChartsOption = {
      backgroundColor: "transparent",
      animation: !prefersReducedMotion,
      animationDurationUpdate: 500,
      animationEasingUpdate: "cubicInOut",
      grid: {
        left: 2,
        right: 2,
        top: 4,
        bottom: 4,
        containLabel: false,
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: isBar ? "shadow" : "line",
          shadowStyle: {
            color: "rgba(255, 255, 255, 0.12)",
          },
          lineStyle: {
            color: "rgba(255, 255, 255, 0.45)",
            width: 1,
            type: "dashed",
          },
        },
        position: (pos, _params, _dom, _rect, size) => {
          if (!pos || !size) return [0, 0];
          const [cursorX, cursorY] = pos;
          const [tooltipW, tooltipH] = size.contentSize;
          const [viewW, viewH] = size.viewSize;

          // Horizontal: center tooltip horizontally relative to cursor, clamp inside view bounds
          let x = cursorX - tooltipW / 2;
          if (x < 2) x = 2;
          if (x + tooltipW > viewW - 2) x = Math.max(2, viewW - tooltipW - 2);

          // Vertical: 10-12px below cursor; if insufficient space below, place above cursor
          const offset = 10;
          let y = cursorY + offset;
          if (y + tooltipH > viewH - 2) {
            y = cursorY - tooltipH - offset;
          }

          return [x, y];
        },
        confine: false, // Position calculation handles bounding within/around card without clipping
        padding: [3, 6],
        backgroundColor: "rgba(15, 23, 42, 0.94)", // Slate-900 high contrast
        borderColor: "rgba(255, 255, 255, 0.15)",
        borderWidth: 0.5,
        textStyle: {
          color: "#ffffff",
          fontSize: 10,
          fontFamily: "inherit",
          lineHeight: 12,
        },
        extraCssText:
          "box-shadow: 0 4px 10px rgba(0,0,0,0.35); border-radius: 4px; z-index: 100; pointer-events: none; width: max-content; min-width: 0; max-width: 180px;",
        formatter: (
          params: echarts.DefaultLabelFormatterCallbackParams | echarts.DefaultLabelFormatterCallbackParams[]
        ) => {
          const p = Array.isArray(params) ? params[0] : params;
          if (!p) return "";
          const dataIndex = p.dataIndex ?? 0;
          const dateStr = formattedDates[dataIndex] ?? p.name ?? "";
          const rawVal = typeof p.value === "number" ? p.value : Number(p.value) || 0;
          const displayVal = formatTooltipValue(rawVal, valueType);

          return (
            `<div style="font-weight: 600; font-size: 9px; color: rgba(255,255,255,0.65); line-height: 1.1; margin-bottom: 2px;">${dateStr}</div>` +
            `<div style="display: flex; align-items: baseline; gap: 5px; white-space: nowrap; line-height: 1.2;">` +
            `<span style="color: rgba(255,255,255,0.85); font-size: 10px;">${label}:</span>` +
            `<span style="font-weight: 700; color: #ffffff; font-size: 10px;">${displayVal}</span>` +
            `</div>`
          );
        },
      },
      xAxis: {
        type: "category",
        data: dates,
        show: false,
        boundaryGap: isBar,
      },
      yAxis: {
        type: "value",
        show: false,
        scale: true,
        min: (value) => (value.min > 0 && !isBar ? Math.floor(value.min * 0.95) : 0),
      },
      series: [seriesOption],
    };

    chart.setOption(option, true);

    const handleResize = () => {
      chart.resize();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [data, type, label, valueType]);

  // Clean up instance on unmount
  useEffect(() => {
    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, []);

  if (!validData || !hasVariation) {
    // Neutral subtle empty state line matching design requirements
    return (
      <div className={className} aria-hidden="true">
        <svg
          viewBox="0 0 120 48"
          className="h-full w-full overflow-visible"
          preserveAspectRatio="none"
        >
          <line
            x1="0"
            y1={24}
            x2={120}
            y2={24}
            stroke="white"
            strokeOpacity="0.25"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
        </svg>
      </div>
    );
  }

  return <div ref={chartRef} className={className} />;
}
