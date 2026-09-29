import type { ReactNode } from "react";
import { data, modelUrl } from "@/lib/data";

export function PageHeader({ title, lede }: { title: string; lede: ReactNode }) {
  return (
    <header className="mb-8">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <div className="prose-lite mt-2 text-[15px]">{lede}</div>
    </header>
  );
}

export function StatTile({ label, value, note, tone }: {
  label: string;
  value: string;
  note?: ReactNode;
  tone?: "good" | "bad";
}) {
  const color = tone === "good" ? "var(--good-text)" : tone === "bad" ? "var(--bad-text)" : "var(--muted)";
  return (
    <div className="card p-4">
      <div className="text-[13px] text-ink-2">{label}</div>
      <div className="mt-1 text-[28px] font-semibold leading-tight">{value}</div>
      {note && <div className="mt-1 text-[12px]" style={{ color }}>{note}</div>}
    </div>
  );
}

// A chart card: title, one-line takeaway, the chart, and a table-view twin.
export function Section({ title, takeaway, sql, table, children }: {
  title: string;
  takeaway?: ReactNode;
  sql?: string; // path under transform/models, e.g. "marts/mrr_bridge_monthly.sql"
  table?: { columns: string[]; rows: (string | number)[][] };
  children: ReactNode;
}) {
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-semibold">{title}</h2>
        {sql && (
          <a className="link text-[12px]" href={modelUrl(sql)} target="_blank" rel="noreferrer">
            View SQL ↗
          </a>
        )}
      </div>
      {takeaway && <div className="prose-lite mt-1 text-[14px]">{takeaway}</div>}
      <div className="mt-3">{children}</div>
      {table && (
        <details className="mt-3 text-[13px]">
          <summary className="cursor-pointer text-ink-2 select-none">Show data table</summary>
          <div className="mt-2 max-h-80 overflow-auto">
            <table className="data">
              <thead>
                <tr>{table.columns.map((c) => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={i}>{r.map((v, j) => <td key={j}>{v}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

export function FixtureBanner() {
  if (data.meta.source !== "fixture") return null;
  return (
    <div className="border-b px-4 py-2 text-center text-[13px]"
         style={{ background: "var(--neutral-mid)", borderColor: "var(--ring)" }}>
      <strong>Placeholder data.</strong> This build uses the synthetic test fixture, not KKBox —
      numbers are meaningless until the pipeline is run on the real dataset.
    </div>
  );
}
