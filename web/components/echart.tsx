"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, HeatmapChart, LineChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";

echarts.use([
  BarChart, HeatmapChart, LineChart,
  GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, VisualMapComponent,
  SVGRenderer,
]);

export type Tokens = {
  surface: string; ink: string; ink2: string; muted: string; grid: string; axis: string;
  series: string[]; seqLow: string; seqHigh: string; neutral: string;
};

function readTokens(): Tokens {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    surface: v("--surface"), ink: v("--ink"), ink2: v("--ink-2"), muted: v("--muted"),
    grid: v("--grid"), axis: v("--axis"),
    series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => v(`--s${i}`)),
    seqLow: v("--seq-100"), seqHigh: v("--seq-700"), neutral: v("--neutral-mid"),
  };
}

type Option = echarts.EChartsCoreOption;

export function EChart({ build, height, label }: {
  build: (t: Tokens) => Option;
  height: number;
  label: string; // accessible name; the table view below each chart carries the values
}) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!el.current) return;
    const chart = echarts.init(el.current, null, { renderer: "svg" });
    const render = () => chart.setOption(build(readTokens()), true);
    render();

    // Re-theme when the OS scheme or an explicit data-theme changes.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", render);
    const mo = new MutationObserver(render);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el.current);

    return () => {
      mq.removeEventListener("change", render);
      mo.disconnect();
      ro.disconnect();
      chart.dispose();
    };
  }, [build]);

  return <div ref={el} role="img" aria-label={label} style={{ width: "100%", height }} />;
}

// ── Shared styling (mark specs: hairline solid grid, recessive axes) ─────────

export const axisX = (t: Tokens, extra: object = {}) => ({
  axisLine: { lineStyle: { color: t.axis } },
  axisTick: { show: false },
  axisLabel: { color: t.muted, fontSize: 11 },
  splitLine: { show: false },
  ...extra,
});

export const axisY = (t: Tokens, extra: object = {}) => ({
  type: "value",
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: { color: t.muted, fontSize: 11 },
  splitLine: { lineStyle: { color: t.grid, width: 1, type: "solid" } },
  ...extra,
});

export const tooltip = (t: Tokens, extra: object = {}) => ({
  backgroundColor: t.surface,
  borderColor: t.grid,
  borderWidth: 1,
  textStyle: { color: t.ink, fontSize: 12 },
  extraCssText: "box-shadow: 0 4px 16px rgba(0,0,0,0.08); border-radius: 8px;",
  ...extra,
});

export const legend = (t: Tokens, extra: object = {}) => ({
  top: 0,
  left: 0,
  icon: "roundRect",
  itemWidth: 10,
  itemHeight: 10,
  textStyle: { color: t.ink2, fontSize: 12 },
  ...extra,
});

export const grid = (extra: object = {}) => ({
  left: 8, right: 16, top: 36, bottom: 8, containLabel: true, ...extra,
});

