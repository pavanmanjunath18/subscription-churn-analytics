import { CaptureCurve, NamedBars } from "@/components/charts";
import { PageHeader, Section, StatTile } from "@/components/ui";
import { data, REPO } from "@/lib/data";
import { pct } from "@/lib/format";
import { bestModel, modelName, topDecile } from "@/lib/insights";

export const metadata = { title: "Predicting churn · Subscription Churn Analytics" };

// Human-readable names for the logistic regression's one-hot/scaled features.
function featureLabel(raw: string) {
  const f = raw.replace(/^(num|cat)__/, "");
  const map: Record<string, string> = {
    cancelled_before_expiry: "Cancelled before expiry",
    is_auto_renew: "Auto-renew on",
    is_returning_subscriber: "Returning subscriber",
    days_active_last_month: "Listening days, last month",
    hours_last_month: "Hours listened, last month",
    completion_rate_last_month: "Share of songs played to the end",
    early_skip_rate_last_month: "Share of songs skipped early",
    hours_trend_ratio: "Listening vs prior 3 months",
    hours_prior_3m_avg: "Hours listened, prior 3 months",
    tenure_months: "Tenure (months)",
    period_in_spell: "Consecutive paid periods",
    discount_pct: "Discount on expiring period",
    monthly_price_ntd: "Monthly price",
    age: "Age",
  };
  if (map[f]) return map[f];
  if (f.startsWith("missingindicator_")) return `${map[f.replace("missingindicator_", "")] ?? f} missing`;
  if (f.startsWith("plan_bucket_")) return `Plan: ${f.replace("plan_bucket_", "")}`;
  if (f.startsWith("payment_method_bucket_")) return `Payment method ${f.replace("payment_method_bucket_", "")}`;
  if (f === "registered_via_nan") return "Sign-up channel unknown";
  if (f.startsWith("registered_via_")) return `Signed up via channel ${f.replace("registered_via_", "")}`;
  return f;
}

export default function ModelPage() {
  const m = data.metrics;
  if (!m.length || !bestModel) return <PageHeader title="Predicting churn" lede={<p>Model results not generated yet.</p>} />;

  const rule = m.find((x) => x.model === "rule_score")!;
  const listen = m.filter((x) => x.feature_set === "engagement_only").sort((a, b) => b.validation_auc - a.validation_auc)[0];
  const best = bestModel;
  const bestTop = topDecile(best.model, best.feature_set);
  const ruleTop = topDecile("rule_score", "rules");
  const coefs = data.coefs
    .filter((c) => c.feature_set === "all_features")
    .sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient))
    .slice(0, 12);

  return (
    <>
      <PageHeader
        title="Can we see churn coming?"
        lede={
          <>
            <p>
              A risk score is only useful if it ranks tomorrow&apos;s churners above everyone else. Each model
              was trained on 2016 renewal decisions, tuned on Q4 2016, and scored <strong>once</strong> on
              January–February 2017: months it never saw, the way it would be used in practice.
            </p>
            <p>
              The best model ({modelName(best)}) reaches an AUC of <strong>{best.test_auc.toFixed(3)}</strong>.
              Contacting its riskiest 10% of expiring members would reach{" "}
              <strong>{pct(bestTop?.cumulative_capture, 0)}</strong> of all churners, against{" "}
              {pct(ruleTop?.cumulative_capture, 0)} for a hand-written rule score and 10% for random outreach.
            </p>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Churn rate in test months" value={pct(best.test_base_rate)} note="What random guessing would find" />
        <StatTile label={`AUC, ${modelName(best)}`} value={best.test_auc.toFixed(3)} note={`Validation ${best.validation_auc.toFixed(3)}`} />
        <StatTile label="AUC, rule-based score" value={rule.test_auc.toFixed(3)} note="Red-flag points, no model" />
        <StatTile label="AUC, listening data only" value={listen ? listen.test_auc.toFixed(3) : "–"} note="No billing flags at all" />
      </div>

      <div className="mt-6 grid gap-6">
        <Section
          title="How many churners each approach finds"
          takeaway={
            <p>
              Sort expiring members from highest to lowest risk and work down the list: the curve shows the
              share of eventual churners reached. The diagonal is random outreach; the higher the curve, the
              less retention budget is wasted on members who were going to stay.
            </p>
          }
          table={{
            columns: ["Top % contacted", modelName(best), "Rule-based score", ...(listen ? [modelName(listen)] : [])],
            rows: Array.from({ length: 10 }, (_, i) => {
              const at = (model: string, fs: string) =>
                pct(data.lift.find((r) => r.model === model && r.feature_set === fs && r.decile === i + 1)?.cumulative_capture, 0);
              return [`${(i + 1) * 10}%`, at(best.model, best.feature_set), at("rule_score", "rules"),
                ...(listen ? [at(listen.model, listen.feature_set)] : [])];
            }),
          }}
        >
          <CaptureCurve
            rows={data.lift}
            models={[
              { model: best.model, feature_set: best.feature_set, name: modelName(best) },
              { model: "rule_score", feature_set: "rules", name: "Rule-based score" },
              ...(listen ? [{ model: listen.model, feature_set: listen.feature_set, name: modelName(listen) }] : []),
            ]}
          />
        </Section>

        <div className="grid gap-6 md:grid-cols-2">
          <Section
            title="Test AUC by approach"
            takeaway={<p>0.5 is a coin flip, 1.0 is perfect. The model is chosen on validation AUC, never on test.</p>}
            table={{
              columns: ["Approach", "Validation AUC", "Test AUC", "Test PR-AUC"],
              rows: m.map((x) => [modelName(x), x.validation_auc.toFixed(3), x.test_auc.toFixed(3), x.test_pr_auc.toFixed(3)]),
            }}
          >
            <NamedBars
              label="Test AUC by approach"
              format="auc"
              items={[...m].sort((a, b) => b.test_auc - a.test_auc).map((x) => ({ name: modelName(x), value: x.test_auc }))}
            />
          </Section>

          <Section
            title="What moves the risk, holding everything else equal"
            takeaway={
              <p>
                Logistic regression odds ratios per standard deviation (or for yes vs no). Right of the line
                raises churn odds, left lowers them. These are associations after adjustment, not causal effects.
              </p>
            }
            sql={undefined}
            table={{
              columns: ["Feature", "Odds ratio"],
              rows: coefs.map((c) => [featureLabel(c.feature), `${c.odds_ratio_per_sd.toFixed(2)}×`]),
            }}
          >
            <NamedBars
              label="Largest logistic regression effects"
              format="odds"
              diverging
              reference={0}
              items={coefs.map((c) => ({ name: featureLabel(c.feature), value: c.coefficient }))}
            />
          </Section>
        </div>

        <div className="prose-lite text-[14px]">
          <p>
            <strong>Caveats.</strong> Every model scores higher on the test months than on validation
            ({best.test_auc.toFixed(3)} against {best.validation_auc.toFixed(3)} for the best one). Q4 2016
            includes December&apos;s churn spike, which is harder to predict, so treat the validation figure as
            the conservative estimate. Payment-method IDs are anonymised in the source data, so the model can
            say that some channels carry far more risk than others, but not which real-world channels they are.
          </p>
          <p>
            Code: <a href={`${REPO}/blob/main/analysis/churn_model.py`} target="_blank" rel="noreferrer">analysis/churn_model.py</a>.
            Features come from <code>fct_renewal_decisions</code> and describe only what was known before the
            renewal month.
          </p>
        </div>
      </div>
    </>
  );
}
