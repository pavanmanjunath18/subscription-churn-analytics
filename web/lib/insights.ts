// Derived figures used in page copy. Every number in the narrative comes from
// here, so the text can never disagree with the charts.
import { data, type CohortRow, type DriverRow } from "./data";

const bridge = data.bridge;
export const latest = bridge[bridge.length - 1];
export const yearAgo = bridge[bridge.length - 13] ?? bridge[0];
export const last12 = bridge.slice(-12);

export const mrrYoY = latest.ending_mrr_ntd / yearAgo.ending_mrr_ntd - 1;
export const subsYoY = latest.ending_subscribers / yearAgo.ending_subscribers - 1;
export const avgLogoChurn12 =
  last12.reduce((a, r) => a + (r.logo_churn_rate ?? 0), 0) / last12.length;

export const sum12 = (k: keyof (typeof bridge)[number]) =>
  last12.reduce((a, r) => a + ((r[k] as number) ?? 0), 0);

/** Subscriber-weighted retention at month m, over cohorts old enough to observe it. */
export function retentionAt(m: number, rows: CohortRow[] = data.cohorts) {
  const at = rows.filter((r) => r.months_since_start === m);
  const size = at.reduce((a, r) => a + r.cohort_size, 0);
  if (!size) return null;
  return {
    logo: at.reduce((a, r) => a + r.retained_subscribers, 0) / size,
    cohorts: at.length,
  };
}

export function driversBy(name: string): DriverRow[] {
  return data.drivers.filter((d) => d.driver === name);
}

/**
 * The riskiest bucket of a driver versus its largest bucket (the typical
 * member). Comparing the two extremes instead produces absurd multiples
 * from small groups.
 */
export function spread(name: string) {
  const rows = driversBy(name);
  if (rows.length < 2) return null;
  const hi = rows.reduce((a, b) => (b.churn_rate > a.churn_rate ? b : a));
  let ref = rows.reduce((a, b) => (b.decisions > a.decisions ? b : a));
  if (ref === hi) ref = rows.reduce((a, b) => (b.churn_rate < a.churn_rate ? b : a));
  return { hi, lo: ref, ratio: ref.churn_rate > 0 ? hi.churn_rate / ref.churn_rate : null };
}

export const label = (bucket: string) => bucket.replace(/^\d: /, "");

export const MODEL_NAMES: Record<string, string> = {
  "rule_score|rules": "Rule-based score",
  "logistic_regression|all_features": "Logistic regression",
  "gradient_boosting|all_features": "Gradient boosting",
  "logistic_regression|engagement_only": "Logistic regression · listening only",
  "gradient_boosting|engagement_only": "Gradient boosting · listening only",
};
export const modelName = (m: { model: string; feature_set: string }) =>
  MODEL_NAMES[`${m.model}|${m.feature_set}`] ?? `${m.model} (${m.feature_set})`;

export const bestModel = [...data.metrics]
  .filter((m) => m.model !== "rule_score")
  .sort((a, b) => b.validation_auc - a.validation_auc)[0];

export function topDecile(model: string, featureSet: string) {
  return data.lift.find((r) => r.model === model && r.feature_set === featureSet && r.decile === 1);
}
