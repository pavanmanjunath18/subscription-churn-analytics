// Number formatting shared by pages (server) and charts (client).
// KKBox bills in New Taiwan dollars; we keep NT$ rather than invent an FX rate.
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export const ntd = (v: number) => `NT$${compact.format(v)}`;
export const ntdFull = (v: number) => `NT$${whole.format(v)}`;
export const count = (v: number) => compact.format(v);
export const countFull = (v: number) => whole.format(v);
export const pct = (v: number | null | undefined, digits = 1) =>
  v == null ? "–" : `${(v * 100).toFixed(digits)}%`;
export const monthLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
