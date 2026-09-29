import { PageHeader } from "@/components/ui";
import { REPO, data, modelUrl } from "@/lib/data";
import { count, pct } from "@/lib/format";

export const metadata = { title: "Method · Subscription Churn Analytics" };

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="text-[17px] font-semibold">{title}</h2>
      <div className="prose-lite mt-1 text-[14px]">{children}</div>
    </section>
  );
}

const M = ({ path, children }: { path: string; children: React.ReactNode }) => (
  <a href={modelUrl(path)} target="_blank" rel="noreferrer"><code>{children}</code></a>
);

export default function MethodPage() {
  const q = data.quality;
  return (
    <>
      <PageHeader
        title="Method"
        lede={<p>How raw billing events become the numbers on this site, and the choices made along the way.</p>}
      />
      <div className="grid gap-4">
        <Block title="Data">
          <p>
            The <a href="https://www.kaggle.com/competitions/kkbox-churn-prediction-challenge" target="_blank" rel="noreferrer">KKBox
            Churn Prediction Challenge</a> (WSDM Cup 2018): real, anonymised records from Asia&apos;s largest
            music-streaming service. Four sources are used: <strong>members</strong> (sign-up channel, city,
            age), <strong>transactions</strong> ({count(q.transactions)} payments, renewals and cancellations from{" "}
            {count(q.members_with_transactions)} members, 2015 to March 2017), <strong>daily listening logs</strong>{" "}
            ({count(q.listening_days)} member-days) and Kaggle&apos;s own churn labels, which are used
            only to validate our definition.
          </p>
          <p>
            The 30 GB listening log is never written to disk: it is streamed out of the archive into DuckDB
            and collapsed to one row per member per month (
            <a href={`${REPO}/blob/main/scripts/ingest.py`} target="_blank" rel="noreferrer"><code>scripts/ingest.py</code></a>).
            Only aggregates, with no group smaller than 50 members, are published here.
          </p>
        </Block>

        <Block title="From transactions to subscriptions">
          <p>
            Transactions are events, not states. They are collapsed to one event per member per day (a same-day
            cancellation beats a renewal) in <M path="intermediate/int_billing_events.sql">int_billing_events</M>,
            then stitched into continuous <strong>subscription spells</strong> with a gaps-and-islands window
            query (<M path="intermediate/int_billing_events_sequenced.sql">int_billing_events_sequenced</M>): a new
            spell starts only when coverage has lapsed for more than 30 days. A renewal a week late is not
            churn followed by a reactivation.
          </p>
          <p>
            The 30-day grace period is the competition&apos;s own churn definition, and our flag agrees with
            Kaggle&apos;s published labels (see <em>Why members churn</em>).
          </p>
        </Block>

        <Block title="Repairing the raw data">
          <p>
            <strong>Holes in the billing export.</strong> Some payment methods almost vanish from the transaction
            log for a month or more, then return at full volume. Method 39, for example, drops from ~76K to ~4K
            transactions a month in February–June 2016, while its members keep listening at their usual rate.
            Taken at face value, that reads as mass churn followed by mass reactivation.{" "}
            <M path="intermediate/int_billing_data_gaps.sql">int_billing_data_gaps</M> flags every
            payment-method-month below 25% of that method&apos;s typical volume ({q.gap_months} months across{" "}
            {q.gap_methods} methods). A lapse that overlaps one of these holes, where the member later reappears,
            is treated as continuous: the renewals were almost certainly made but not exported. This applies to{" "}
            {pct(q.share_spells_bridged)} of subscription spells. Members who never reappear still count as churned.
          </p>
          <p>
            <strong>Missing plan lengths.</strong> {pct(q.share_plan_days_inferred)} of transactions record a plan
            length of zero, yet 99% of them are paid and expire about 31 days later: ordinary monthly payments with
            the field missing. The length is inferred from the expiry date instead of dropping them.
          </p>
          <p>
            <strong>Start of the data.</strong> The log begins in January 2015, so everyone already subscribed then
            looks new. 2015 is used as warm-up: revenue flows and churn rates are reported from January 2016, and
            cohorts from March 2015.
          </p>
        </Block>

        <Block title="Revenue">
          <p>
            <strong>MRR</strong> is measured on the last day of each month: a member counts if a spell covers
            that date, and contributes the price of their latest paid period normalised to 30 days
            (<code>amount paid × 30 ÷ plan days</code>). The price comes from an <code>ASOF JOIN</code> in{" "}
            <M path="intermediate/int_paying_months.sql">int_paying_months</M>. Amounts stay in New Taiwan
            dollars rather than applying an invented exchange rate.
          </p>
          <p>
            Every member-month is classified as new, expansion, contraction, churned, reactivation or retained
            (<M path="marts/fct_subscriber_months.sql">fct_subscriber_months</M>). The monthly bridge must satisfy
            <em> beginning + new + reactivation + expansion − contraction − churn = ending</em>, and a dbt test
            fails the build if any month is off by more than one cent.
          </p>
          <p>
            <strong>NRR and GRR</strong> are reported on a trailing-twelve-month basis: revenue today from members
            who paid twelve months ago, over what they paid then (GRR caps each member at their old amount). The
            one-month ratios are kept in the data tables but not headlined, because ~99% a month reads as healthy
            and is actually ~89% a year.
          </p>
        </Block>

        <Block title="Churn and the model">
          <p>
            <M path="marts/fct_renewal_decisions.sql">fct_renewal_decisions</M> has one row per paid period at the
            moment it expires. <strong>Churned</strong> means no further paid period in the same spell. Periods
            expiring within 30 days of the end of the data are dropped as <em>censored</em>, because their outcome
            is not yet knowable.
          </p>
          <p>
            Features only use information from before the decision month: billing settings, tenure, prior churn,
            and listening in the last full month compared with the three before it. Evaluation is{" "}
            <strong>out-of-time</strong>: train on 2016, choose models on Q4 2016, report on Jan–Feb 2017 once. A
            random split would let the model learn from the future.
          </p>
          <p>
            An explicit cancellation is a legitimate predictor (it happens before expiry), but it is close to the
            outcome itself. So the site also reports a <em>listening-only</em> model, which measures how much
            behaviour alone reveals before a member takes any billing action.
          </p>
        </Block>

        <Block title="Limitations">
          <p>
            Month-end snapshots miss members whose whole subscription falls inside one calendar month (e.g. a
            single 7-day plan); they are in the renewal-decision analysis but not in MRR. Expansion and
            contraction mostly reflect plan-length and promotional-price changes, not upsell. Listening logs end
            in February 2017, which bounds the test window. The billing-gap repair is a judgement call: a few months
            (e.g. March 2016 at ~7% churn) remain elevated after it, and may still contain export problems. Churn-driver charts show associations, and members
            who choose auto-renew differ from those who don&apos;t in ways the data cannot see.
          </p>
        </Block>

        <Block title="Stack">
          <p>
            DuckDB for storage and compute · dbt for the transformation layer and its tests · scikit-learn for
            the backtest · Next.js static export with ECharts, hosted on Vercel. No server or database runs
            behind this site; everything is computed at build time.{" "}
            <a href={REPO} target="_blank" rel="noreferrer">Source on GitHub</a>.
          </p>
        </Block>
      </div>
    </>
  );
}
