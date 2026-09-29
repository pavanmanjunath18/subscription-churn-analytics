import Link from "next/link";
import { ChurnMixColumns, DriverBars } from "@/components/charts";
import { PageHeader, Section } from "@/components/ui";
import { data } from "@/lib/data";
import { countFull, monthLabel, pct } from "@/lib/format";
import { driversBy, label, spread } from "@/lib/insights";

export const metadata = { title: "Why members churn · Subscription Churn Analytics" };

const DRIVERS: { name: string; why: string }[] = [
  { name: "Auto-renew", why: "Whether the member's most recent payment was set to renew automatically." },
  { name: "Cancelled before expiry", why: "An explicit cancellation during the paid period. Near-certain churn, so it is also the easiest signal to act on." },
  { name: "Listening days (last month)", why: "Days with any listening in the last full month before the renewal decision." },
  { name: "Tenure", why: "Months since the member's first paid period." },
  { name: "Plan length", why: "Longer prepaid plans are a commitment; weekly and monthly plans are not." },
  { name: "Discount", why: "Price paid versus list price on the expiring period." },
  { name: "Returning subscriber", why: "Whether this member had churned before and come back." },
];

function sentence(name: string) {
  const s = spread(name);
  if (!s || s.ratio == null) return null;
  return (
    <p>
      <strong>{label(s.hi.bucket)}</strong> churns at {pct(s.hi.churn_rate)} versus {pct(s.lo.churn_rate)} for{" "}
      <strong>{label(s.lo.bucket)}</strong>, {s.ratio.toFixed(1)}× the rate.
    </p>
  );
}

export default function ChurnPage() {
  const decisions = data.drivers.filter((d) => d.driver === "Auto-renew").reduce((a, d) => a + d.decisions, 0);
  const overall = data.drivers.filter((d) => d.driver === "Auto-renew")
    .reduce((a, d) => a + d.churn_rate * d.decisions, 0) / (decisions || 1);
  const mixTotals = data.mix.reduce(
    (a, r) => ({ c: a.c + r.cancelled, d: a.d + r.did_not_renew, l: a.l + r.auto_renew_lapsed, n: a.n + r.churners }),
    { c: 0, d: 0, l: 0, n: 0 });
  const autoOn = driversBy("Auto-renew").find((d) => d.bucket === "on");
  const autoOff = driversBy("Auto-renew").find((d) => d.bucket === "off");
  const autoRatio = autoOn && autoOff && autoOn.churn_rate > 0 ? autoOff.churn_rate / autoOn.churn_rate : null;
  const L = data.labels;
  const ours = L.find((r) => r.comparison.startsWith("Our pipeline vs Kaggle labelling code") && r.members > 0);
  const v1 = L.find((r) => r.comparison.startsWith("Published v1 labels") && r.members > 0);

  return (
    <>
      <PageHeader
        title="Why members churn"
        lede={
          <>
            <p>
              Every time a paid period runs out, a member either renews within 30 days or churns. Across{" "}
              <strong>{countFull(decisions)}</strong> of those renewal decisions in 2016 to early 2017,{" "}
              <strong>{pct(overall)}</strong> ended in churn.
              {autoRatio != null && <> Members renewing manually churn at <strong>{autoRatio.toFixed(1)}×</strong>{" "}
                the rate of members on auto-renew.</>}
            </p>
            <p>
              Each chart below changes one factor at a time. These are associations, not causes: auto-renewers
              differ from manual renewers in many ways. The <Link href="/model/">model page</Link> tests which
              factors still predict churn when they are considered together.
            </p>
          </>
        }
      />

      <Section
        title="Three ways to churn"
        takeaway={
          <p>
            Of all churners, <strong>{pct(mixTotals.c / (mixTotals.n || 1), 0)}</strong> actively cancelled,{" "}
            <strong>{pct(mixTotals.d / (mixTotals.n || 1), 0)}</strong> were on manual renewal and simply didn&apos;t
            renew, and <strong>{pct(mixTotals.l / (mixTotals.n || 1), 0)}</strong> had auto-renew on but the
            renewal never went through. That last group is likely payment failure, the cheapest churn to win back.
          </p>
        }
        sql="marts/fct_renewal_decisions.sql"
        table={{
          columns: ["Month", "Churners", "Cancelled", "Didn't renew", "Auto-renew lapsed"],
          rows: data.mix.map((r) => [monthLabel(r.decision_month), countFull(r.churners), countFull(r.cancelled),
            countFull(r.did_not_renew), countFull(r.auto_renew_lapsed)]),
        }}
      >
        <ChurnMixColumns rows={data.mix} />
      </Section>

      <h2 className="mt-10 mb-3 text-[20px] font-semibold">Churn rate at renewal, by factor</h2>
      <div className="grid gap-6 md:grid-cols-2">
        {DRIVERS.filter((d) => driversBy(d.name).length > 0).map((d) => (
          <Section
            key={d.name}
            title={d.name}
            takeaway={<>{<p className="text-[13px]">{d.why}</p>}{sentence(d.name)}</>}
            sql="marts/fct_renewal_decisions.sql"
            table={{
              columns: ["Group", "Renewal decisions", "Churn rate"],
              rows: driversBy(d.name).map((r) => [label(r.bucket), countFull(r.decisions), pct(r.churn_rate, 2)]),
            }}
          >
            <DriverBars rows={driversBy(d.name)} />
          </Section>
        ))}
      </div>

      {ours && (
        <div className="mt-8">
          <Section
            title="Checking the churn definition against Kaggle's own code"
            takeaway={
              <>
                <p>
                  The competition ships the script that produced its labels. Re-implemented in SQL and run on the
                  same transactions, it agrees with this pipeline&apos;s churn flag for{" "}
                  <strong>{pct(ours.agreement)}</strong> of the {countFull(ours.members)} members whose membership
                  expired in February 2017. A dbt test fails the build if that drops below 99%.
                </p>
                {v1 && (
                  <p>
                    The labels Kaggle actually published agree with that same script only {pct(v1.agreement)} of the
                    time, and show a higher churn rate ({pct(v1.churn_rate_first)} against {pct(v1.churn_rate_second)}).
                    Scoring this pipeline against the published file would have understated it, so the audit uses
                    the code.
                  </p>
                )}
              </>
            }
            sql="audit/audit_label_agreement.sql"
            table={{
              columns: ["Comparison", "Members", "Agreement", "Churn rate (first)", "Churn rate (second)"],
              rows: L.map((r) => [r.comparison, countFull(r.members), pct(r.agreement), pct(r.churn_rate_first, 2), pct(r.churn_rate_second, 2)]),
            }}
          >
            <></>
          </Section>
        </div>
      )}
    </>
  );
}
