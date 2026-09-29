import { CohortHeatmap, RetentionLines, TrendLine } from "@/components/charts";
import { PageHeader, Section, StatTile } from "@/components/ui";
import { data, flows } from "@/lib/data";
import { countFull, monthLabel, pct } from "@/lib/format";
import { avgLogoChurn12, latest, retentionAt } from "@/lib/insights";

export const metadata = { title: "Retention · Subscription Churn Analytics" };

export default function RetentionPage() {
  const m1 = retentionAt(1), m6 = retentionAt(6), m12 = retentionAt(12);
  const annualised = 1 - Math.pow(1 - avgLogoChurn12, 12);
  const withT12m = data.bridge.filter((r) => r.nrr_t12m != null);

  return (
    <>
      <PageHeader
        title="How long members stay"
        lede={
          <p>
            Of every member who starts paying, <strong>{pct(m1?.logo)}</strong> are still paying a month
            later and <strong>{pct(m12?.logo)}</strong> after a year. A monthly churn rate of{" "}
            <strong>{pct(avgLogoChurn12, 2)}</strong> sounds small; compounded, it replaces about{" "}
            <strong>{pct(annualised, 0)}</strong> of the subscriber base every year.
          </p>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Net revenue retention (T12M)" value={pct(latest.nrr_t12m)} note={monthLabel(latest.month)} />
        <StatTile label="Gross revenue retention (T12M)" value={pct(latest.grr_t12m)} note="Excludes upgrades" />
        <StatTile label="Still paying after 6 months" value={pct(m6?.logo)} note={`Across ${m6?.cohorts ?? 0} cohorts`} />
        <StatTile label="Still paying after 12 months" value={pct(m12?.logo)} note={`Across ${m12?.cohorts ?? 0} cohorts`} />
      </div>

      <div className="mt-6 grid gap-6">
        <Section
          title="Revenue retention, trailing twelve months"
          takeaway={
            <p>
              Revenue this month from the members who were paying twelve months earlier, divided by what
              they paid then. This is the standard definition, and not the one-month ratio that is often
              mislabelled as NRR: a monthly figure of 99% compounds to about 89% over a year.
            </p>
          }
          sql="marts/mrr_bridge_monthly.sql"
          table={{
            columns: ["Month", "NRR (T12M)", "GRR (T12M)", "NRR (1-month)", "GRR (1-month)"],
            rows: withT12m.map((r) => [monthLabel(r.month), pct(r.nrr_t12m), pct(r.grr_t12m), pct(r.nrr_monthly), pct(r.grr_monthly)]),
          }}
        >
          <RetentionLines rows={data.bridge} />
        </Section>

        <Section
          title="Monthly subscriber churn rate"
          takeaway={<p>Members paying at the start of the month who were not paying at the end, as a share of those paying at the start. New members are not in the denominator.</p>}
          sql="marts/mrr_bridge_monthly.sql"
          table={{
            columns: ["Month", "Paying at start", "Churned", "Churn rate"],
            rows: flows().filter((r) => r.logo_churn_rate != null).map((r) =>
              [monthLabel(r.month), countFull(r.beginning_subscribers), countFull(r.churned_subscribers), pct(r.logo_churn_rate, 2)]),
          }}
        >
          <TrendLine rows={flows().filter((r) => r.logo_churn_rate != null)} field="logo_churn_rate" kind="pct" label="Monthly churn rate" height={240} />
        </Section>

        <Section
          title="Cohort retention"
          takeaway={
            <p>
              Each row is the group of members whose first paid month was that month; each cell is the share
              still paying <em>n</em> months later. Only fully observed cells are shown, so the triangle
              shape is the data running out, not members leaving.
            </p>
          }
          sql="marts/cohort_retention.sql"
          table={{
            columns: ["Cohort", "Size", "M1", "M3", "M6", "M12"],
            rows: [...new Set(data.cohorts.map((c) => c.cohort_month))].map((cm) => {
              const at = (m: number) => data.cohorts.find((c) => c.cohort_month === cm && c.months_since_start === m);
              return [monthLabel(cm), countFull(at(0)?.cohort_size ?? 0),
                pct(at(1)?.logo_retention), pct(at(3)?.logo_retention), pct(at(6)?.logo_retention), pct(at(12)?.logo_retention)];
            }),
          }}
        >
          <CohortHeatmap rows={data.cohorts} metric="logo_retention" />
        </Section>
      </div>
    </>
  );
}
