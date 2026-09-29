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
export type LabelRow = { members: number; agreement: number | null; kaggle_churn_rate: number | null; our_churn_rate: number | null };

export const data = {
  bridge: bridge as BridgeRow[],
  cohorts: cohorts as CohortRow[],
  drivers: drivers as DriverRow[],
  mix: mix as MixRow[],
  metrics: metrics as MetricRow[],
  lift: lift as LiftRow[],
  coefs: coefs as CoefRow[],
  labels: (labels as LabelRow[])[0],
  meta: meta as { source: "kkbox" | "fixture"; generated_at: string },
};

export const REPO = "https://github.com/pavanmanjunath18/subscription-churn-analytics";
export const modelUrl = (path: string) => `${REPO}/blob/main/transform/models/${path}`;
