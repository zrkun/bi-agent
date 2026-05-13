"use client";

import { defineCatalog } from "@json-render/core";
import { defineRegistry, useStateValue } from "@json-render/react";
import { schema } from "@json-render/react/schema";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { CSSProperties, ReactNode } from "react";

import {
  Area,
  AreaChart as RechartsAreaChart,
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart as RechartsLineChart,
  Pie,
  PieChart as RechartsPieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart as RechartsRadarChart,
  RadialBar,
  RadialBarChart,
  XAxis,
  YAxis,
} from "recharts";
import CountUp from "react-countup";

import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { WidgetResult } from "@/lib/screens/types";
import { cn } from "@/lib/utils";

const layoutSchema = z.object({
  h: z.number(),
  w: z.number(),
  x: z.number(),
  y: z.number(),
});
const styleSchema = z.record(z.string(), z.unknown()).optional();

export const screenCatalog = defineCatalog(schema, {
  actions: {},
  components: {
    DashboardRoot: {
      description: "大屏根节点，负责画布尺寸、背景和主题。",
      props: z.object({
        layout: layoutSchema,
        style: styleSchema,
        theme: z.string().optional(),
        title: z.string(),
      }),
    },
    SectionHeader: {
      description: "大屏标题区。",
      props: z.object({
        layout: layoutSchema,
        style: styleSchema,
        subtitle: z.string().optional(),
        title: z.string(),
      }),
    },
    TextBlock: {
      description: "文本说明组件。",
      props: z.object({
        content: z.string().optional(),
        layout: layoutSchema,
        style: styleSchema,
        title: z.string(),
      }),
    },
    MetricCard: {
      description: "指标卡组件。",
      props: z.object({
        bindingKey: z.string(),
        format: z.string().nullable().optional(),
        layout: layoutSchema,
        title: z.string(),
      }),
    },
    ProgressCard: {
      description: "进度指标组件。",
      props: z.object({
        bindingKey: z.string(),
        format: z.string().nullable().optional(),
        layout: layoutSchema,
        title: z.string(),
      }),
    },
    LineChart: {
      description: "趋势折线图组件。",
      props: z.object({
        bindingKey: z.string(),
        format: z.string().nullable().optional(),
        layout: layoutSchema,
        title: z.string(),
      }),
    },
    MultiLineChart: {
      description: "多指标趋势折线图组件。",
      props: z.object({
        bindingKey: z.string(),
        format: z.string().nullable().optional(),
        layout: layoutSchema,
        title: z.string(),
      }),
    },
    AreaChart: {
      description: "面积趋势图组件。",
      props: z.object({
        bindingKey: z.string(),
        format: z.string().nullable().optional(),
        layout: layoutSchema,
        title: z.string(),
      }),
    },
    BarChart: {
      description: "分类柱图组件。",
      props: z.object({
        bindingKey: z.string(),
        format: z.string().nullable().optional(),
        layout: layoutSchema,
        title: z.string(),
      }),
    },
    MultiBarChart: {
      description: "多指标分类柱图组件。",
      props: z.object({
        bindingKey: z.string(),
        format: z.string().nullable().optional(),
        layout: layoutSchema,
        title: z.string(),
      }),
    },
    RankList: {
      description: "TopN 排行组件。",
      props: z.object({
        bindingKey: z.string(),
        format: z.string().nullable().optional(),
        layout: layoutSchema,
        title: z.string(),
      }),
    },
    PieChart: {
      description: "占比图组件。",
      props: z.object({
        bindingKey: z.string(),
        format: z.string().nullable().optional(),
        layout: layoutSchema,
        title: z.string(),
      }),
    },
    RadarChart: {
      description: "雷达图组件。",
      props: z.object({
        bindingKey: z.string(),
        format: z.string().nullable().optional(),
        layout: layoutSchema,
        title: z.string(),
      }),
    },
    RadialChart: {
      description: "径向图组件。",
      props: z.object({
        bindingKey: z.string(),
        format: z.string().nullable().optional(),
        layout: layoutSchema,
        title: z.string(),
      }),
    },
    DonutChart: {
      description: "环形占比图组件。",
      props: z.object({
        bindingKey: z.string(),
        format: z.string().nullable().optional(),
        layout: layoutSchema,
        title: z.string(),
      }),
    },
    DataTable: {
      description: "数据表格组件。",
      props: z.object({
        bindingKey: z.string(),
        format: z.string().nullable().optional(),
        layout: layoutSchema,
        title: z.string(),
      }),
    },
  },
});

export const { registry: screenRegistry } = defineRegistry(screenCatalog, {
  components: {
    DashboardRoot: ({ children, props }) => (
      <ScaledDashboardRoot layout={props.layout} style={props.style} theme={props.theme}>
        {children}
      </ScaledDashboardRoot>
    ),
    SectionHeader: ({ props }) => (
      <Positioned layout={props.layout}>
        <div className="flex h-full flex-col items-center justify-center border-b border-slate-200 text-center" style={toStyle(props.style)}>
          <div className="text-[34px] font-semibold tracking-normal text-slate-950">
            {props.title}
          </div>
          {props.subtitle ? (
            <div className="mt-1 text-sm text-slate-500">
              {props.subtitle}
            </div>
          ) : null}
        </div>
      </Positioned>
    ),
    TextBlock: ({ props }) => (
      <Positioned layout={props.layout}>
        <div
          className="flex h-full flex-col justify-center overflow-hidden rounded-xl border border-slate-200 bg-white/82 p-4 text-slate-700 shadow-sm"
          style={toStyle(props.style)}
        >
          <div className="text-base font-medium text-slate-950">{props.title}</div>
          <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-500">
            {props.content || "双击或在右侧配置文本内容"}
          </div>
        </div>
      </Positioned>
    ),
    MetricCard: ({ props }) => (
      <Positioned layout={props.layout}>
        <Panel title={props.title}>
          <WidgetValue bindingKey={props.bindingKey} renderMetric />
        </Panel>
      </Positioned>
    ),
    ProgressCard: ({ props }) => (
      <Positioned layout={props.layout}>
        <Panel title={props.title}>
          <WidgetValue bindingKey={props.bindingKey} renderProgress />
        </Panel>
      </Positioned>
    ),
    LineChart: ({ props }) => (
      <Positioned layout={props.layout}>
        <Panel title={props.title}>
          <WidgetValue bindingKey={props.bindingKey} renderTrend />
        </Panel>
      </Positioned>
    ),
    MultiLineChart: ({ props }) => (
      <Positioned layout={props.layout}>
        <Panel title={props.title}>
          <WidgetValue bindingKey={props.bindingKey} renderMultiTrend />
        </Panel>
      </Positioned>
    ),
    AreaChart: ({ props }) => (
      <Positioned layout={props.layout}>
        <Panel title={props.title}>
          <WidgetValue bindingKey={props.bindingKey} renderArea />
        </Panel>
      </Positioned>
    ),
    BarChart: ({ props }) => (
      <Positioned layout={props.layout}>
        <Panel title={props.title}>
          <WidgetValue bindingKey={props.bindingKey} renderBreakdown />
        </Panel>
      </Positioned>
    ),
    MultiBarChart: ({ props }) => (
      <Positioned layout={props.layout}>
        <Panel title={props.title}>
          <WidgetValue bindingKey={props.bindingKey} renderMultiBreakdown />
        </Panel>
      </Positioned>
    ),
    RankList: ({ props }) => (
      <Positioned layout={props.layout}>
        <Panel title={props.title}>
          <WidgetValue bindingKey={props.bindingKey} renderRank />
        </Panel>
      </Positioned>
    ),
    PieChart: ({ props }) => (
      <Positioned layout={props.layout}>
        <Panel title={props.title}>
          <WidgetValue bindingKey={props.bindingKey} renderPie />
        </Panel>
      </Positioned>
    ),
    DonutChart: ({ props }) => (
      <Positioned layout={props.layout}>
        <Panel title={props.title}>
          <WidgetValue bindingKey={props.bindingKey} renderDonut />
        </Panel>
      </Positioned>
    ),
    RadarChart: ({ props }) => (
      <Positioned layout={props.layout}>
        <Panel title={props.title}>
          <WidgetValue bindingKey={props.bindingKey} renderRadar />
        </Panel>
      </Positioned>
    ),
    RadialChart: ({ props }) => (
      <Positioned layout={props.layout}>
        <Panel title={props.title}>
          <WidgetValue bindingKey={props.bindingKey} renderRadial />
        </Panel>
      </Positioned>
    ),
    DataTable: ({ props }) => (
      <Positioned layout={props.layout}>
        <Panel title={props.title}>
          <WidgetValue bindingKey={props.bindingKey} renderTable />
        </Panel>
      </Positioned>
    ),
  },
});

let activeRenderOptions = { disableAutoScale: false };

export function setScreenRenderOptions(options: { disableAutoScale?: boolean }) {
  activeRenderOptions = {
    ...activeRenderOptions,
    ...options,
  };
}

function ScaledDashboardRoot({
  children,
  layout,
  style,
  theme = "light",
}: {
  children: ReactNode;
  layout: { h: number; w: number; x: number; y: number };
  style?: unknown;
  theme?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const disableAutoScale = activeRenderOptions.disableAutoScale;

  useEffect(() => {
    if (disableAutoScale) {
      setScale(1);
      return undefined;
    }

    const element = ref.current;

    if (!element) {
      return;
    }

    const updateScale = () => setScale(element.clientWidth / layout.w);
    const observer = new ResizeObserver(updateScale);
    observer.observe(element);
    updateScale();

    return () => observer.disconnect();
  }, [disableAutoScale, layout.w]);

  return (
    <div
      className="relative w-full overflow-visible"
      ref={ref}
      style={
        {
          "--screen-scale": scale,
          height: layout.h * scale,
        } as React.CSSProperties
      }
    >
      <div
        className={cn(
          "relative origin-top-left overflow-hidden bg-transparent",
          theme === "dark" ? "text-slate-100" : "text-slate-950",
        )}
        data-screen-theme={theme}
        style={{
          height: layout.h,
          transform: `scale(${scale})`,
          width: layout.w,
          ...toStyle(style),
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Positioned({
  children,
  layout,
}: {
  children: ReactNode;
  layout: { h: number; w: number; x: number; y: number };
}) {
  return (
    <div
      className="absolute"
      style={{
        height: layout.h,
        left: layout.x,
        top: layout.y,
        width: layout.w,
      }}
    >
      {children}
    </div>
  );
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/82 p-4 shadow-sm">
      <div className="mb-3 text-sm font-medium text-slate-600">
        {title}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

function toStyle(value: unknown): CSSProperties | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  return value as CSSProperties;
}

function WidgetValue({
  renderArea,
  bindingKey,
  renderBreakdown,
  renderDonut,
  renderMetric,
  renderMultiBreakdown,
  renderMultiTrend,
  renderPie,
  renderProgress,
  renderRadar,
  renderRadial,
  renderRank,
  renderTable,
  renderTrend,
}: {
  bindingKey: string;
  renderArea?: boolean;
  renderBreakdown?: boolean;
  renderDonut?: boolean;
  renderMetric?: boolean;
  renderMultiBreakdown?: boolean;
  renderMultiTrend?: boolean;
  renderPie?: boolean;
  renderProgress?: boolean;
  renderRadar?: boolean;
  renderRadial?: boolean;
  renderRank?: boolean;
  renderTable?: boolean;
  renderTrend?: boolean;
}) {
  const result = useStateValue<WidgetResult>(`/previewData/${bindingKey}`);

  if (renderMetric) {
    return <MetricResultView result={result} />;
  }

  if (renderProgress) {
    return <ProgressResultView result={result} />;
  }

  if (renderTrend) {
    return <TrendResultView result={result} />;
  }

  if (renderMultiTrend) {
    return <MultiTrendResultView result={result} />;
  }

  if (renderArea) {
    return <AreaResultView result={result} />;
  }

  if (renderPie) {
    return <PieResultView result={result} />;
  }

  if (renderDonut) {
    return <DonutResultView result={result} />;
  }

  if (renderRadar) {
    return <RadarResultView result={result} />;
  }

  if (renderRadial) {
    return <RadialResultView result={result} />;
  }

  if (renderRank) {
    return <RankResultView result={result} />;
  }

  if (renderBreakdown) {
    return <BreakdownResultView result={result} />;
  }

  if (renderMultiBreakdown) {
    return <MultiBreakdownResultView result={result} />;
  }

  if (renderTable) {
    return <TableResultView result={result} />;
  }

  return null;
}

function MetricResultView({ result }: { result?: WidgetResult }) {
  const value = result?.type === "metric" ? result.value : null;

  return (
    <div className="flex h-full flex-col justify-between">
      <div className="text-[34px] font-semibold leading-none tracking-normal text-slate-950">
        <AnimatedNumber value={value} />
      </div>
      <div className="mt-2.5 flex items-center gap-2 text-xs text-slate-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        <span>当前数据汇总</span>
      </div>
    </div>
  );
}

function ProgressResultView({ result }: { result?: WidgetResult }) {
  const value = result?.type === "metric" ? Number(result.value ?? 0) : 0;
  const percent = Math.max(8, Math.min(100, (value / Math.max(value, 1)) * 100));

  return (
    <div className="flex h-full flex-col justify-between gap-3">
      <div>
        <div className="text-[30px] font-semibold leading-none text-slate-950">
          <AnimatedNumber value={value} />
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-blue-600"
            style={{ width: `${percent.toFixed(2)}%` }}
          />
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>当前完成值</span>
        <span>{percent.toFixed(0)}%</span>
      </div>
    </div>
  );
}

function TrendResultView({ result }: { result?: WidgetResult }) {
  const points = result?.type === "trend" ? result.points : [];
  const data = points.map((point) => ({
    label: formatAxisLabel(point.x),
    value: point.y ?? 0,
  }));

  return points.length ? (
    <ChartContainer
      className="h-full w-full"
      config={{ value: { color: "#2563eb", label: "数值" } }}
    >
      <RechartsLineChart accessibilityLayer data={data}>
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="label"
          interval="preserveStartEnd"
          tickLine={false}
          tickMargin={8}
        />
        <ChartTooltip content={<ChartTooltipContent hideLabel />} cursor={false} />
        <Line
          dataKey="value"
          dot={false}
          stroke="var(--color-value)"
          strokeWidth={2.4}
          type="monotone"
        />
      </RechartsLineChart>
    </ChartContainer>
  ) : (
    <EmptyResult />
  );
}

function MultiTrendResultView({ result }: { result?: WidgetResult }) {
  const series = result?.type === "trend" && result.series ? result.series.slice(0, 4) : [];
  const items = result?.type === "trend" && result.items ? result.items : [];
  const colors = ["#2563eb", "#10b981", "#f59e0b", "#8b5cf6"];
  const data = items.map((item) => Object.assign({}, item, {
    x: formatAxisLabel(String(item.x ?? "")),
  }));

  if (!series.length || !data.length) {
    return <EmptyResult />;
  }

  return (
    <ChartContainer
      className="h-full w-full"
      config={Object.fromEntries(series.map((name, index) => [name, { color: colors[index % colors.length], label: name }]))}
    >
      <RechartsLineChart accessibilityLayer data={data}>
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="x"
          interval="preserveStartEnd"
          tickLine={false}
          tickMargin={8}
        />
        <ChartTooltip content={<ChartTooltipContent />} cursor={false} />
        {series.map((name, index) => (
          <Line
            dataKey={name}
            dot={false}
            key={name}
            stroke={colors[index % colors.length]}
            strokeWidth={2}
            type="monotone"
          />
        ))}
      </RechartsLineChart>
    </ChartContainer>
  );
}

function AreaResultView({ result }: { result?: WidgetResult }) {
  const points = result?.type === "trend" ? result.points : [];
  const data = points.map((point) => ({
    label: formatAxisLabel(point.x),
    value: point.y ?? 0,
  }));

  return points.length ? (
    <ChartContainer
      className="h-full w-full"
      config={{ value: { color: "#3b82f6", label: "数值" } }}
    >
      <RechartsAreaChart accessibilityLayer data={data}>
        <defs>
          <linearGradient id="screenAreaValue" x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="label"
          interval="preserveStartEnd"
          tickLine={false}
          tickMargin={8}
        />
        <ChartTooltip content={<ChartTooltipContent hideLabel />} cursor={false} />
        <Area
          dataKey="value"
          fill="url(#screenAreaValue)"
          stroke="var(--color-value)"
          strokeWidth={2}
          type="natural"
        />
      </RechartsAreaChart>
    </ChartContainer>
  ) : (
    <EmptyResult />
  );
}

function DonutResultView({ result }: { result?: WidgetResult }) {
  const items = getBreakdownItems(result, 5);
  const total = items.reduce((sum, item) => sum + Number(item.value ?? 0), 0);
  const colors = ["#2563eb", "#10b981", "#f59e0b", "#8b5cf6", "#64748b"];

  if (!items.length || total <= 0) {
    return <EmptyResult />;
  }

  return (
    <div className="flex h-full items-center justify-center">
      <div className="grid h-full w-full max-w-[680px] grid-cols-[260px_minmax(0,1fr)] items-center gap-8">
        <PieChartView colors={colors} innerRadius={58} items={items} outerRadius={92} />
        <div className="grid content-center gap-2.5 text-xs">
        {items.map((item, index) => (
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2" key={item.label}>
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: colors[index % colors.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-slate-500">{item.label}</span>
            <span className="tabular-nums text-slate-700">{formatValue(item.value)}</span>
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}

function PieResultView({ result }: { result?: WidgetResult }) {
  const items = getBreakdownItems(result, 6);

  return items.length ? (
    <PieChartView colors={["#2563eb", "#10b981", "#f59e0b", "#8b5cf6", "#64748b", "#ef4444"]} items={items} />
  ) : (
    <EmptyResult />
  );
}

function PieChartView({
  colors,
  innerRadius,
  items,
  outerRadius = 72,
}: {
  colors: string[];
  innerRadius?: number;
  items: Array<{ label: string; value: number | null }>;
  outerRadius?: number;
}) {
  const data = items.map((item, index) => ({
    fill: colors[index % colors.length],
    label: item.label,
    value: item.value ?? 0,
  }));

  return (
    <ChartContainer className="h-full w-full" config={{ value: { label: "数值" } }}>
      <RechartsPieChart>
        <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="label" />} cursor={false} />
        <Pie
          data={data}
          dataKey="value"
          innerRadius={innerRadius}
          nameKey="label"
          outerRadius={outerRadius}
          paddingAngle={2}
        >
          {data.map((item) => (
            <Cell fill={item.fill} key={item.label} />
          ))}
        </Pie>
      </RechartsPieChart>
    </ChartContainer>
  );
}

function RadarResultView({ result }: { result?: WidgetResult }) {
  const items = getBreakdownItems(result, 6);
  const data = items.map((item) => ({
    label: item.label,
    value: item.value ?? 0,
  }));

  return items.length ? (
    <ChartContainer
      className="h-full w-full"
      config={{ value: { color: "#2563eb", label: "数值" } }}
    >
      <RechartsRadarChart data={data}>
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <PolarAngleAxis dataKey="label" tick={{ fontSize: 11 }} />
        <PolarGrid />
        <Radar dataKey="value" fill="var(--color-value)" fillOpacity={0.22} stroke="var(--color-value)" />
      </RechartsRadarChart>
    </ChartContainer>
  ) : (
    <EmptyResult />
  );
}

function RadialResultView({ result }: { result?: WidgetResult }) {
  const items = getBreakdownItems(result, 5);
  const data = items.map((item, index) => ({
    fill: ["#2563eb", "#10b981", "#f59e0b", "#8b5cf6", "#64748b"][index % 5],
    label: item.label,
    value: item.value ?? 0,
  }));

  return items.length ? (
    <ChartContainer className="h-full w-full" config={{ value: { label: "数值" } }}>
      <RadialBarChart data={data} endAngle={0} innerRadius="24%" outerRadius="92%" startAngle={180}>
        <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="label" />} cursor={false} />
        <RadialBar background dataKey="value" />
      </RadialBarChart>
    </ChartContainer>
  ) : (
    <EmptyResult />
  );
}

function RankResultView({ result }: { result?: WidgetResult }) {
  const items = getBreakdownItems(result, 6);
  const max = Math.max(...items.map((item) => item.value ?? 0), 1);

  return items.length ? (
    <div className="grid h-full content-center gap-2.5">
      {items.map((item, index) => (
        <div
          className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 text-xs"
          key={item.label}
        >
          <span className="flex size-5 items-center justify-center rounded bg-slate-100 font-medium text-slate-500">
            {index + 1}
          </span>
          <div className="min-w-0">
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="truncate text-slate-600">{item.label}</span>
              <span className="shrink-0 font-medium tabular-nums text-slate-900">{formatValue(item.value)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <span
                className="block h-full rounded-full bg-[#4f7dff]"
                style={{ width: `${Math.max(8, ((item.value ?? 0) / max) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <EmptyResult />
  );
}

function BreakdownResultView({ result }: { result?: WidgetResult }) {
  const items = getBreakdownItems(result, 6);
  const data = items.map((item) => ({
    label: item.label,
    value: item.value ?? 0,
  }));

  return items.length ? (
    <ChartContainer
      className="h-full w-full"
      config={{ value: { color: "#2563eb", label: "数值" } }}
    >
      <RechartsBarChart accessibilityLayer data={data}>
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="label"
          interval={0}
          tickLine={false}
          tickMargin={8}
        />
        <YAxis axisLine={false} tickLine={false} />
        <ChartTooltip content={<ChartTooltipContent hideLabel />} cursor={false} />
        <Bar dataKey="value" fill="var(--color-value)" radius={4} />
      </RechartsBarChart>
    </ChartContainer>
  ) : (
    <EmptyResult />
  );
}

function getBreakdownItems(result: WidgetResult | undefined, limit: number) {
  if (result?.type !== "breakdown") {
    return [];
  }

  return result.items.slice(0, limit).map((item) => ({
    label: String(item.label ?? ""),
    value: Number(item.value ?? 0),
  }));
}

function MultiBreakdownResultView({ result }: { result?: WidgetResult }) {
  const series = result?.type === "breakdown" && result.series ? result.series.slice(0, 4) : [];
  const rows = result?.type === "breakdown" ? result.items.slice(0, 8) : [];
  const colors = ["#2563eb", "#10b981", "#f59e0b", "#8b5cf6"];
  const data = rows.map((item) => Object.assign({}, item, { label: String(item.label ?? "") }));

  if (!series.length || !data.length) {
    return <EmptyResult />;
  }

  return (
    <ChartContainer
      className="h-full w-full"
      config={Object.fromEntries(series.map((name, index) => [name, { color: colors[index % colors.length], label: name }]))}
    >
      <RechartsBarChart accessibilityLayer data={data}>
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="label"
          interval={0}
          tickLine={false}
          tickMargin={8}
        />
        <YAxis axisLine={false} tickLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} cursor={false} />
        {series.map((name, index) => (
          <Bar dataKey={name} fill={colors[index % colors.length]} key={name} radius={4} />
        ))}
      </RechartsBarChart>
    </ChartContainer>
  );
}

function TableResultView({ result }: { result?: WidgetResult }) {
  const table = result?.type === "table" ? result : null;
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [table]);

  if (!table || table.rows.length === 0) {
    return <EmptyResult />;
  }

  const columns = table.columns.slice(0, 6);
  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil(table.rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const visibleRows = table.rows.slice(startIndex, startIndex + pageSize);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
      <Table className="text-[11px]" containerClassName="min-h-0 flex-1 overflow-auto">
        <TableHeader className="sticky top-0 z-10 bg-slate-50">
          <TableRow className="bg-slate-50 hover:bg-slate-50">
            {columns.map((column) => (
              <TableHead className="h-9 px-3 text-[11px] font-medium text-slate-600" key={column}>
                {column}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.map((row, index) => (
            <TableRow className="border-slate-100 hover:bg-slate-50/70" key={index}>
              {columns.map((column) => (
                <TableCell className="max-w-36 truncate px-3 py-2 text-[11px] text-slate-600" key={column}>
                  {String(row[column] ?? "")}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/70 px-3 py-2 text-[11px] text-slate-500">
        <span>
          第 {currentPage} / {totalPages} 页
        </span>
        <div className="flex items-center gap-2">
          <button
            className="rounded border border-slate-200 bg-white px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={currentPage <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            type="button"
          >
            上一页
          </button>
          <button
            className="rounded border border-slate-200 bg-white px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            type="button"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyResult() {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400">
      暂无可预览数据
    </div>
  );
}

function formatValue(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "--";
  }

  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

function AnimatedNumber({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) {
    return "--";
  }

  return (
    <CountUp
      decimals={getDecimalPlaces(value)}
      duration={1.1}
      end={value}
      preserveValue
      separator=","
    />
  );
}

function getDecimalPlaces(value: number) {
  return Number.isInteger(value) ? 0 : 2;
}

function formatAxisLabel(value: string) {
  return value.slice(5, 10) || value;
}
