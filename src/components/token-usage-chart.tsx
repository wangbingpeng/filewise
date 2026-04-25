"use client";

import { useMemo } from "react";

interface DailyUsage {
  date: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requestCount: number;
}

interface TokenUsageChartProps {
  data: DailyUsage[];
  height?: number;
}

export function TokenUsageChart({ data, height = 200 }: TokenUsageChartProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return null;

    const maxTokens = Math.max(...data.map((d) => d.totalTokens), 1);
    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const width = 600;
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Show at most 30 data points, sample if more
    const sampledData =
      data.length <= 30
        ? data
        : data.filter((_, i) => i % Math.ceil(data.length / 30) === 0);

    const points = sampledData.map((d, i) => {
      const x = padding.left + (i / (sampledData.length - 1 || 1)) * chartWidth;
      const y =
        padding.top +
        chartHeight -
        (d.totalTokens / maxTokens) * chartHeight;
      return { x, y, data: d };
    });

    const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

    // Y-axis labels
    const yLabels = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
      y: padding.top + chartHeight - ratio * chartHeight,
      value: Math.round(maxTokens * ratio).toLocaleString(),
    }));

    // X-axis labels (show first, middle, last)
    const xLabels = [
      sampledData[0],
      sampledData[Math.floor(sampledData.length / 2)],
      sampledData[sampledData.length - 1],
    ]
      .filter(Boolean)
      .map((d, i, arr) => {
        const idx = sampledData.indexOf(d);
        const x =
          padding.left + (idx / (sampledData.length - 1 || 1)) * chartWidth;
        return { x, date: d.date.slice(5) }; // Show MM-DD
      });

    return { points, pathD, yLabels, xLabels, maxTokens, padding, chartHeight };
  }, [data, height]);

  if (!chartData) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground"
        style={{ height }}
      >
        暂无数据
      </div>
    );
  }

  const { points, pathD, yLabels, xLabels, padding, chartHeight } = chartData;

  return (
    <svg
      viewBox={`0 0 600 ${height}`}
      className="w-full"
      style={{ height }}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Grid lines */}
      {yLabels.map((label, i) => (
        <line
          key={i}
          x1={padding.left}
          x2={600 - padding.right}
          y1={label.y}
          y2={label.y}
          stroke="var(--border)"
          strokeDasharray="4 4"
        />
      ))}

      {/* Y-axis labels */}
      {yLabels.map((label, i) => (
        <text
          key={i}
          x={padding.left - 10}
          y={label.y + 4}
          textAnchor="end"
          className="fill-muted-foreground text-xs"
        >
          {label.value}
        </text>
      ))}

      {/* X-axis labels */}
      {xLabels.map((label, i) => (
        <text
          key={i}
          x={label.x}
          y={height - 10}
          textAnchor="middle"
          className="fill-muted-foreground text-xs"
        >
          {label.date}
        </text>
      ))}

      {/* Gradient fill under line */}
      <defs>
        <linearGradient id="tokenGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </linearGradient>
      </defs>

      <path
        d={`${pathD} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`}
        fill="url(#tokenGradient)"
      />

      {/* Line */}
      <path
        d={pathD}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="2"
      />

      {/* Data points */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="3"
          fill="hsl(var(--primary))"
          className="cursor-pointer"
        >
          <title>
            {p.data.date}: {p.data.totalTokens.toLocaleString()} tokens
            {"\n"}Prompt: {p.data.promptTokens.toLocaleString()}
            {"\n"}Completion: {p.data.completionTokens.toLocaleString()}
            {"\n"}Requests: {p.data.requestCount}
          </title>
        </circle>
      ))}

      {/* Axis labels */}
      <text
        x={300}
        y={height - 2}
        textAnchor="middle"
        className="fill-muted-foreground text-xs"
      >
        日期
      </text>
      <text
        x={15}
        y={height / 2}
        textAnchor="middle"
        transform={`rotate(-90, 15, ${height / 2})`}
        className="fill-muted-foreground text-xs"
      >
        Tokens
      </text>
    </svg>
  );
}
