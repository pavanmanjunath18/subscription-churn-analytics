import { MovementColumns, TrendLine, Waterfall } from "@/components/charts";
import { PageHeader, Section, StatTile } from "@/components/ui";
import { data } from "@/lib/data";
import { countFull, monthLabel, ntd, ntdFull, pct } from "@/lib/format";
import { avgLogoChurn12, last12, latest, mrrYoY, subsYoY, sum12, yearAgo } from "@/lib/insights";

export default function RevenuePage() {
  const gains = sum12("new_mrr_ntd") + sum12("reactivation_mrr_ntd") + sum12("expansion_mrr_ntd");
  const losses = sum12("contraction_mrr_ntd") + sum12("churned_mrr_ntd");
  const churnShareOfLoss = sum12("churned_mrr_ntd") / losses;

  return (
    <>
      <PageHeader
        title="Where subscription revenue comes from, and where it leaks"
        lede={
          <p>
            Monthly recurring revenue for KKBox, a music-streaming service, rebuilt from{" "}
            {data.meta.source === "kkbox" ? "~20 million" : "raw"} billing transactions. In the twelve months
            to {monthLabel(latest.month)}, MRR moved <strong>{pct(mrrYoY)}</strong> to{" "}
            <strong>{ntd(latest.ending_mrr_ntd)}</strong>. New and returning members added{" "}
            <strong>{ntd(gains)}</strong> of monthly revenue while <strong>{ntd(losses)}</strong> leaked out,{" "}
            {pct(churnShareOfLoss, 0)} of it through outright churn rather than downgrades.
          </p>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={`MRR, ${monthLabel(latest.month)}`} value={ntd(latest.ending_mrr_ntd)}
          note={`${mrrYoY >= 0 ? "+" : ""}${pct(mrrYoY)} vs ${monthLabel(yearAgo.month)}`} tone={mrrYoY >= 0 ? "good" : "bad"} />
        <StatTile label="Paying subscribers" value={countFull(latest.ending_subscribers)}
          note={`${subsYoY >= 0 ? "+" : ""}${pct(subsYoY)} year over year`} tone={subsYoY >= 0 ? "good" : "bad"} />
        <StatTile label="Net revenue retention (T12M)" value={pct(latest.nrr_t12m)}
          note="Revenue kept from members paying a year ago" />
        <StatTile label="Monthly subscriber churn" value={pct(avgLogoChurn12, 2)}
          note="Average of the last 12 months" />
      </div>

      <div className="mt-6 grid gap-6">
        <Section
          title="Monthly recurring revenue"
          takeaway={<p>Paid plans normalised to a 30-day month, measured on the last day of each month.</p>}
          sql="marts/mrr_bridge_monthly.sql"
          table={{
            columns: ["Month", "MRR", "Paying subscribers", "ARPU"],
            rows: data.bridge.map((r) => [monthLabel(r.month), ntdFull(r.ending_mrr_ntd),
              countFull(r.ending_subscribers), r.arpu_ntd ? `NT$${r.arpu_ntd.toFixed(0)}` : "–"]),
          }}
        >
          <TrendLine rows={data.bridge} field="ending_mrr_ntd" kind="ntd" label="MRR" />
        </Section>

        <Section
          title="The last twelve months as a bridge"
          takeaway={<p>Starting MRR, plus every source of growth, minus every source of loss, equals ending MRR. A dbt test checks that this reconciles to the cent for every month.</p>}
          sql="marts/mrr_bridge_monthly.sql"
          table={{
            columns: ["Component", "MRR"],
            rows: [
              ["Starting MRR", ntdFull(last12[0].beginning_mrr_ntd)],
              ["+ New", ntdFull(sum12("new_mrr_ntd"))],
              ["+ Reactivation", ntdFull(sum12("reactivation_mrr_ntd"))],
              ["+ Expansion", ntdFull(sum12("expansion_mrr_ntd"))],
              ["− Contraction", ntdFull(sum12("contraction_mrr_ntd"))],
              ["− Churned", ntdFull(sum12("churned_mrr_ntd"))],
              ["Ending MRR", ntdFull(latest.ending_mrr_ntd)],
            ],
          }}
        >
          <Waterfall rows={last12} />
        </Section>

        <Section
          title="Revenue movements by month"
          takeaway={<p>Gains stack above zero, losses below. Expansion and contraction here are mostly members switching plan length or moving on or off a promotional price.</p>}
          sql="marts/fct_subscriber_months.sql"
          table={{
            columns: ["Month", "New", "Reactivation", "Expansion", "Contraction", "Churned"],
            rows: data.bridge.map((r) => [monthLabel(r.month), ntdFull(r.new_mrr_ntd), ntdFull(r.reactivation_mrr_ntd),
              ntdFull(r.expansion_mrr_ntd), ntdFull(r.contraction_mrr_ntd), ntdFull(r.churned_mrr_ntd)]),
          }}
        >
          <MovementColumns rows={data.bridge} />
        </Section>

        <Section
          title="Paying subscribers"
          takeaway={<p>Shown on its own axis rather than overlaid on MRR: two scales on one chart invent correlations.</p>}
          sql="intermediate/int_paying_months.sql"
        >
          <TrendLine rows={data.bridge} field="ending_subscribers" kind="count" label="Paying subscribers" height={220} />
        </Section>
      </div>
    </>
  );
}
