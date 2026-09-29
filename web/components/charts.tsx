"use client";

import { useCallback, useMemo } from "react";
import { EChart, Tokens, axisX, axisY, grid, legend, tooltip } from "./echart";
import type { BridgeRow, CohortRow, DriverRow, LiftRow, MixRow } from "@/lib/data";
import { count, countFull, monthLabel, ntd, ntdFull, pct } from "@/lib/format";

const shortMonth = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });

// ── Single-series trend (MRR, subscribers, churn rate …) ──────────────────────
export function TrendLine({ rows, field, kind, label, height = 260 }: {
  rows: BridgeRow[];
  field: keyof BridgeRow;
  kind: "ntd" | "count" | "pct";
  label: string;
  height?: number;
}) {
  const pts = useMemo(() => rows.filter((r) => r[field] != null), [rows, field]);
  const build = useCallback((t: Tokens) => {
    const fmt = kind === "ntd" ? ntd : kind === "count" ? count : (v: number) => pct(v);
    const fmtFull = kind === "ntd" ? ntdFull : kind === "count" ? countFull : (v: number) => pct(v, 2);
    const last = pts[pts.length - 1];
    return {
      grid: grid({ top: 16, right: 64 }),
      tooltip: tooltip(t, {
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: t.axis } },
        valueFormatter: (v: number) => fmtFull(v),
      }),
      xAxis: axisX(t, { type: "category", boundaryGap: false, data: pts.map((r) => shortMonth(r.month)) }),
      yAxis: axisY(t, { axisLabel: { color: t.muted, fontSize: 11, formatter: fmt } }),
      series: [{
        name: label,
        type: "line",
        data: pts.map((r) => r[field]),
        showSymbol: false,
        symbolSize: 8,
        lineStyle: { width: 2, color: t.series[0], cap: "round", join: "round" },
        itemStyle: { color: t.series[0], borderColor: t.surface, borderWidth: 2 },
        areaStyle: kind === "pct" ? undefined : { color: t.series[0], opacity: 0.1 },
        // Direct-label the endpoint only.
        markPoint: undefined,
        endLabel: {
          show: true, color: t.ink2, fontSize: 12, fontWeight: 600,
          formatter: () => (last ? fmt(last[field] as number) : ""),
        },
      }],
    };
  }, [pts, field, kind, label]);
  return <EChart build={build} height={height} label={label} />;
}

// ── MRR movements: stacked columns, gains above zero and losses below ────────
const MOVES: { key: keyof BridgeRow; name: string; sign: 1 | -1 }[] = [
  { key: "new_mrr_ntd", name: "New", sign: 1 },
  { key: "reactivation_mrr_ntd", name: "Reactivation", sign: 1 },
  { key: "expansion_mrr_ntd", name: "Expansion", sign: 1 },
  { key: "contraction_mrr_ntd", name: "Contraction", sign: -1 },
  { key: "churned_mrr_ntd", name: "Churned", sign: -1 },
];

export function MovementColumns({ rows, height = 320 }: { rows: BridgeRow[]; height?: number }) {
  const build = useCallback((t: Tokens) => ({
    grid: grid(),
    legend: legend(t),
    tooltip: tooltip(t, {
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: t.grid, opacity: 0.4 } },
      valueFormatter: (v: number) => ntdFull(Math.abs(v)),
    }),
    xAxis: axisX(t, { type: "category", data: rows.map((r) => shortMonth(r.month)) }),
    yAxis: axisY(t, { axisLabel: { color: t.muted, fontSize: 11, formatter: (v: number) => ntd(v) } }),
    series: MOVES.map((m, i) => ({
      name: m.name,
      type: "bar",
      stack: m.sign > 0 ? "gain" : "loss",
      barMaxWidth: 24,
      itemStyle: { color: t.series[i], borderColor: t.surface, borderWidth: 1 },
      emphasis: { focus: "series" },
      data: rows.map((r) => m.sign * ((r[m.key] as number) ?? 0)),
    })),
  }), [rows]);
  return <EChart build={build} height={height} label="Monthly MRR movements by type" />;
}

// ── Waterfall: start → gains → losses → end over a window ─────────────────────
export function Waterfall({ rows, height = 300 }: { rows: BridgeRow[]; height?: number }) {
  const build = useCallback((t: Tokens) => {
    const start = rows[0].beginning_mrr_ntd;
    const end = rows[rows.length - 1].ending_mrr_ntd;
    const sum = (k: keyof BridgeRow) => rows.reduce((a, r) => a + ((r[k] as number) ?? 0), 0);
    const steps = [
      { name: `MRR ${shortMonth(rows[0].month)} start`, value: start, kind: "total" },
      ...MOVES.map((m) => ({ name: m.name, value: m.sign * sum(m.key), kind: m.sign > 0 ? "up" : "down" })),
      { name: `MRR ${shortMonth(rows[rows.length - 1].month)} end`, value: end, kind: "total" },
    ];
    let running = 0;
    const base: number[] = [], bar: { value: number; itemStyle: object }[] = [];
    for (const s of steps) {
      if (s.kind === "total") {
        base.push(0);
        running = s.value;
      } else if (s.kind === "up") {
        base.push(running);
        running += s.value;
      } else {
        running += s.value;
        base.push(running);
      }
      const color = s.kind === "total" ? t.ink2 : s.kind === "up" ? t.series[0] : t.series[7];
      bar.push({ value: Math.abs(s.value), itemStyle: { color, borderRadius: [4, 4, 0, 0] } });
    }
    return {
      grid: grid({ top: 24 }),
      tooltip: tooltip(t, {
        trigger: "axis",
        axisPointer: { type: "shadow", shadowStyle: { color: t.grid, opacity: 0.4 } },
        formatter: (p: { dataIndex: number }[]) => {
          const s = steps[p[0].dataIndex];
          return `${s.name}<br/><b>${s.kind === "down" ? "−" : s.kind === "up" ? "+" : ""}${ntdFull(Math.abs(s.value))}</b>`;
        },
      }),
      xAxis: axisX(t, { type: "category", data: steps.map((s) => s.name), axisLabel: { color: t.muted, fontSize: 11, interval: 0 } }),
      yAxis: axisY(t, { axisLabel: { color: t.muted, fontSize: 11, formatter: (v: number) => ntd(v) } }),
      series: [
        { type: "bar", stack: "w", data: base, itemStyle: { color: "transparent" }, emphasis: { disabled: true }, tooltip: { show: false }, barMaxWidth: 48 },
        {
          type: "bar", stack: "w", data: bar, barMaxWidth: 48,
          label: {
            show: true, position: "top", color: t.ink2, fontSize: 11,
            formatter: (p: { dataIndex: number }) => {
              const s = steps[p.dataIndex];
              return `${s.kind === "down" ? "−" : s.kind === "up" ? "+" : ""}${ntd(Math.abs(s.value))}`;
            },
          },
        },
      ],
    };
  }, [rows]);
  return <EChart build={build} height={height} label="MRR bridge waterfall" />;
}

// ── Two retention rates on one percentage axis ────────────────────────────────
export function RetentionLines({ rows, height = 280 }: { rows: BridgeRow[]; height?: number }) {
  const pts = useMemo(() => rows.filter((r) => r.nrr_t12m != null), [rows]);
  const build = useCallback((t: Tokens) => {
    const series = [
      { name: "Net revenue retention (T12M)", key: "nrr_t12m" as const, color: t.series[0] },
      { name: "Gross revenue retention (T12M)", key: "grr_t12m" as const, color: t.series[1] },
    ];
    return {
      grid: grid({ right: 56 }),
      legend: legend(t),
      tooltip: tooltip(t, { trigger: "axis", valueFormatter: (v: number) => pct(v) }),
      xAxis: axisX(t, { type: "category", boundaryGap: false, data: pts.map((r) => shortMonth(r.month)) }),
      yAxis: axisY(t, { scale: true, axisLabel: { color: t.muted, fontSize: 11, formatter: (v: number) => pct(v, 0) } }),
      series: series.map((s) => ({
        name: s.name,
        type: "line",
        showSymbol: false,
        symbolSize: 8,
        data: pts.map((r) => r[s.key]),
        lineStyle: { width: 2, color: s.color },
        itemStyle: { color: s.color, borderColor: t.surface, borderWidth: 2 },
        endLabel: { show: true, color: t.ink2, fontSize: 12, formatter: (p: { value: number }) => pct(p.value) },
      })),
    };
  }, [pts]);
  return <EChart build={build} height={height} label="Trailing twelve month net and gross revenue retention" />;
}

// ── Cohort triangle: sequential single-hue heatmap ────────────────────────────
export function CohortHeatmap({ rows, metric, maxMonths = 24 }: {
  rows: CohortRow[];
  metric: "logo_retention" | "revenue_retention";
  maxMonths?: number;
}) {
  const cohorts = useMemo(() => [...new Set(rows.map((r) => r.cohort_month))].sort(), [rows]);
  const months = useMemo(() => Array.from({ length: maxMonths + 1 }, (_, i) => i), [maxMonths]);
  const build = useCallback((t: Tokens) => ({
    grid: grid({ top: 8, right: 8, bottom: 56 }),
    tooltip: tooltip(t, {
      formatter: (p: { value: [number, number, number, number] }) =>
        `Cohort ${monthLabel(cohorts[p.value[1]])}<br/>Month ${p.value[0]}: <b>${pct(p.value[2])}</b>` +
        `<br/><span style="color:${t.muted}">${countFull(p.value[3])} still paying</span>`,
    }),
    xAxis: axisX(t, { type: "category", data: months.map((m) => `M${m}`), splitArea: { show: false } }),
    yAxis: { type: "category", inverse: true, data: cohorts.map(shortMonth), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: t.muted, fontSize: 10 } },
    visualMap: {
      min: 0, max: 1, calculable: false, orient: "horizontal", left: "center", bottom: 0,
      itemWidth: 12, itemHeight: 160, text: ["100%", "0%"], textStyle: { color: t.muted, fontSize: 11 },
      inRange: { color: [t.seqLow, t.seqHigh] },
    },
    series: [{
      type: "heatmap",
      data: rows
        .filter((r) => r.months_since_start <= maxMonths)
        .map((r) => [r.months_since_start, cohorts.indexOf(r.cohort_month), r[metric], r.retained_subscribers]),
      itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 2 },
      emphasis: { itemStyle: { borderColor: t.ink, borderWidth: 1 } },
    }],
  }), [rows, metric, cohorts, months, maxMonths]);
  return <EChart build={build} height={Math.max(320, cohorts.length * 16 + 90)} label="Cohort retention heatmap" />;
}

// ── Churn rate by bucket, one small chart per driver (single series) ─────────
export function DriverBars({ rows, height }: { rows: DriverRow[]; height?: number }) {
  const sorted = useMemo(() => [...rows].sort((a, b) => a.bucket.localeCompare(b.bucket)), [rows]);
  const clean = (b: string) => b.replace(/^\d: /, "");
  const build = useCallback((t: Tokens) => ({
    grid: grid({ top: 4, right: 56, bottom: 4 }),
    tooltip: tooltip(t, {
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: t.grid, opacity: 0.4 } },
      formatter: (p: { dataIndex: number }[]) => {
        const r = sorted[p[0].dataIndex];
        return `${clean(r.bucket)}<br/>Churn rate <b>${pct(r.churn_rate)}</b><br/><span style="color:${t.muted}">${countFull(r.decisions)} renewal decisions</span>`;
      },
    }),
    xAxis: axisY(t, { axisLabel: { show: false }, splitLine: { show: false } }),
    yAxis: { type: "category", inverse: true, data: sorted.map((r) => clean(r.bucket)), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: t.ink2, fontSize: 12 } },
    series: [{
      type: "bar",
      barMaxWidth: 20,
      data: sorted.map((r) => r.churn_rate),
      itemStyle: { color: t.series[0], borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: "right", color: t.ink2, fontSize: 12, formatter: (p: { value: number }) => pct(p.value) },
    }],
  }), [sorted]);
  return <EChart build={build} height={height ?? sorted.length * 34 + 16} label={`Churn rate by ${rows[0]?.driver}`} />;
}

// ── Why churners left: stacked counts by reason ───────────────────────────────
const MIX_PARTS = [
  { key: "cancelled" as const, name: "Cancelled before expiry" },
  { key: "did_not_renew" as const, name: "Manual renewal, didn't renew" },
  { key: "auto_renew_lapsed" as const, name: "Auto-renew on, payment lapsed" },
];

export function ChurnMixColumns({ rows, height = 300 }: { rows: MixRow[]; height?: number }) {
  const build = useCallback((t: Tokens) => ({
    grid: grid(),
    legend: legend(t),
    tooltip: tooltip(t, { trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: t.grid, opacity: 0.4 } }, valueFormatter: (v: number) => countFull(v) }),
    xAxis: axisX(t, { type: "category", data: rows.map((r) => shortMonth(r.decision_month)) }),
    yAxis: axisY(t, { axisLabel: { color: t.muted, fontSize: 11, formatter: (v: number) => count(v) } }),
    series: MIX_PARTS.map((p, i) => ({
      name: p.name, type: "bar", stack: "c", barMaxWidth: 24,
      itemStyle: { color: t.series[i], borderColor: t.surface, borderWidth: 1 },
      data: rows.map((r) => r[p.key]),
    })),
  }), [rows]);
  return <EChart build={build} height={height} label="Churned members by reason" />;
}

// ── Cumulative churner capture by risk decile, per model ──────────────────────
export function CaptureCurve({ rows, models, height = 300 }: {
  rows: LiftRow[];
  models: { model: string; feature_set: string; name: string }[];
  height?: number;
}) {
  const build = useCallback((t: Tokens) => ({
    grid: grid({ right: 24 }),
    legend: legend(t),
    tooltip: tooltip(t, {
      trigger: "axis",
      valueFormatter: (v: number) => pct(v),
      axisPointer: { type: "line", lineStyle: { color: t.axis } },
    }),
    xAxis: axisX(t, { type: "category", boundaryGap: false, data: ["0%", ...Array.from({ length: 10 }, (_, i) => `${(i + 1) * 10}%`)], name: "Members contacted (highest risk first)", nameLocation: "middle", nameGap: 28, nameTextStyle: { color: t.muted, fontSize: 11 } }),
    yAxis: axisY(t, { max: 1, axisLabel: { color: t.muted, fontSize: 11, formatter: (v: number) => pct(v, 0) } }),
    series: [
      ...models.map((m, i) => ({
        name: m.name, type: "line", showSymbol: false, symbolSize: 8,
        lineStyle: { width: 2, color: t.series[i] },
        itemStyle: { color: t.series[i], borderColor: t.surface, borderWidth: 2 },
        data: [0, ...rows.filter((r) => r.model === m.model && r.feature_set === m.feature_set)
          .sort((a, b) => a.decile - b.decile).map((r) => r.cumulative_capture)],
      })),
      {
        name: "Random targeting", type: "line", showSymbol: false,
        lineStyle: { width: 1, color: t.muted },
        itemStyle: { color: t.muted },
        data: Array.from({ length: 11 }, (_, i) => i / 10),
      },
    ],
  }), [rows, models]);
  return <EChart build={build} height={height} label="Share of churners captured by risk decile" />;
}

// ── Horizontal bars for a handful of named values (AUC, odds ratios) ─────────
export function NamedBars({ items, format, reference, height, label, diverging = false }: {
  items: { name: string; value: number }[];
  format: "auc" | "odds";
  reference?: number;
  height?: number;
  label: string;
  diverging?: boolean;
}) {
  // "odds": values are log-odds (coefficients) so the axis is symmetric around 0;
  // labels show the odds ratio, which is what a reader can interpret.
  const build = useCallback((t: Tokens) => {
    const f = format === "auc" ? (v: number) => v.toFixed(3) : (v: number) => `${Math.exp(v).toFixed(2)}×`;
    return {
    grid: grid({ top: 4, right: 56, bottom: 4 }),
    tooltip: tooltip(t, { trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: t.grid, opacity: 0.4 } }, valueFormatter: (v: number) => f(v) }),
    xAxis: axisY(t, {
      // AUC axis starts at the coin-flip line unless a model is worse than chance.
      min: format === "auc" ? Math.min(0.5, Math.floor(Math.min(...items.map((i) => i.value)) * 10) / 10) : undefined,
      max: format === "auc" ? 1 : undefined,
      axisLabel: { color: t.muted, fontSize: 11 },
    }),
    yAxis: { type: "category", inverse: true, data: items.map((i) => i.name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: t.ink2, fontSize: 12 } },
    series: [{
      type: "bar", barMaxWidth: 18,
      data: items.map((i) => ({
        value: i.value,
        itemStyle: {
          color: diverging ? (i.value >= (reference ?? 0) ? t.series[7] : t.series[0]) : t.series[0],
          borderRadius: i.value >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4],
        },
      })),
      label: {
        show: true, color: t.ink2, fontSize: 12,
        position: "right",
        formatter: (p: { value: number }) => f(p.value),
      },
      labelLayout: (p: { rect: { x: number; width: number }; labelRect: { width: number }; dataIndex: number }) =>
        items[p.dataIndex].value < 0 ? { x: p.rect.x - p.labelRect.width - 6, align: "left" } : {},
      markLine: reference == null ? undefined : {
        silent: true, symbol: "none",
        lineStyle: { color: t.axis, width: 1, type: "solid" },
        label: { show: false },
        data: [{ xAxis: reference }],
      },
    }],
  };
  }, [items, format, reference, diverging]);
  return <EChart build={build} height={height ?? items.length * 32 + 16} label={label} />;
}
