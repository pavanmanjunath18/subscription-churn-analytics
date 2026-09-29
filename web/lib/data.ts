// Typed access to the aggregate JSON written by scripts/export_site_data.py.
// Imported at build time only: the static export inlines what each page uses.
import bridge from "@/data/mrr_bridge.json";
import cohorts from "@/data/cohort_retention.json";
import drivers from "@/data/churn_drivers.json";
import mix from "@/data/churn_mix.json";
import metrics from "@/data/model_metrics.json";
import lift from "@/data/model_lift.json";
import coefs from "@/data/model_coefficients.json";
import labels from "@/data/label_agreement.json";
import meta from "@/data/meta.json";
import quality from "@/data/data_quality.json";

export type BridgeRow = {
  month: string;
  beginning_mrr_ntd: number;
  new_mrr_ntd: number;
  reactivation_mrr_ntd: number;
  expansion_mrr_ntd: number;
  contraction_mrr_ntd: number;
  churned_mrr_ntd: number;
  ending_mrr_ntd: number;
  beginning_subscribers: number;
  new_subscribers: number;
  reactivated_subscribers: number;
  churned_subscribers: number;
  ending_subscribers: number;
  logo_churn_rate: number | null;
  nrr_monthly: number | null;
  grr_monthly: number | null;
  nrr_t12m: number | null;
  grr_t12m: number | null;
  arpu_ntd: number | null;
};
export type CohortRow = {
  cohort_month: string;
  months_since_start: number;
  cohort_size: number;
  retained_subscribers: number;
  logo_retention: number;
  revenue_retention: number;
};
export type DriverRow = { driver: string; bucket: string; decisions: number; churn_rate: number };
export type MixRow = {
  decision_month: string;
  churners: number;
  cancelled: number;
  did_not_renew: number;
  auto_renew_lapsed: number;
};
export type MetricRow = {
  model: string;
  feature_set: string;
  test_auc: number;
  test_pr_auc: number;
  validation_auc: number;
  test_base_rate: number;
};
export type LiftRow = {
  decile: number;
  members: number;
  churners: number;
  churn_rate: number;
  lift: number;
  cumulative_capture: number;
  model: string;
  feature_set: string;
};
export type CoefRow = { feature: string; coefficient: number; odds_ratio_per_sd: number; feature_set: string };
export type QualityRow = {
  transactions: number;
  members_with_transactions: number;
  listening_days: number;
  gap_months: number;
  gap_methods: number;
  share_spells_bridged: number;
  share_plan_days_inferred: number;
  renewal_decisions: number;
};
export type LabelRow = {
  comparison: string;
  members: number;
  agreement: number;
  churn_rate_first: number;
  churn_rate_second: number;
  precision: number | null;
  recall: number | null;
};

export const data = {
  bridge: bridge as BridgeRow[],
  cohorts: cohorts as CohortRow[],
  drivers: drivers as DriverRow[],
  mix: mix as MixRow[],
  metrics: metrics as MetricRow[],
  lift: lift as LiftRow[],
  coefs: coefs as CoefRow[],
  labels: labels as LabelRow[],
  meta: meta as { source: "kkbox" | "fixture"; generated_at: string },
  quality: (quality as QualityRow[])[0],
};

// Revenue flows and churn rates are reported from here: 2015 is warm-up (the
// data starts Jan 2015, and T12M retention needs a year of history).
export const ANALYSIS_START = "2016-01-01";
export const flows = () => data.bridge.filter((r) => r.month >= ANALYSIS_START);

export const REPO = "https://github.com/pavanmanjunath18/subscription-churn-analytics";
export const modelUrl = (path: string) => `${REPO}/blob/main/transform/models/${path}`;
