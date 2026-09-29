#!/usr/bin/env python3
"""
Export AGGREGATE tables from the warehouse as JSON into web/data/.

Those small files are committed so Vercel can build the site from git. Nothing
member-level leaves the warehouse: KKBox's competition data must not be
redistributed, and every table here is grouped to >= MIN_GROUP members.

    python scripts/export_site_data.py [--db data/warehouse.duckdb] [--source kkbox|fixture]
"""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "data"
MIN_GROUP = 50

TABLES = {
    "mrr_bridge": "select * from mrr_bridge_monthly order by month",

    "cohort_retention": """
        select * from cohort_retention where cohort_size >= {min_group}
        order by cohort_month, months_since_start""",

    # Churn rate at renewal decisions, by one driver at a time.
    "churn_drivers": """
        with d as (
            select *,
                   case when plan_days <= 7 then '1: <=7 days' when plan_days <= 31 then '2: 30 days'
                        when plan_days <= 100 then '3: 90 days' else '4: 180+ days' end as plan_length,
                   case when tenure_months < 3 then '1: <3 mo' when tenure_months < 6 then '2: 3-5 mo'
                        when tenure_months < 12 then '3: 6-11 mo' else '4: 12+ mo' end as tenure_band,
                   case when days_active_last_month = 0 then '1: 0 days'
                        when days_active_last_month < 5 then '2: 1-4 days'
                        when days_active_last_month < 15 then '3: 5-14 days'
                        else '4: 15+ days' end as listening_days_band,
                   case when discount_pct is null or discount_pct = 0 then '1: full price'
                        when discount_pct < 0.5 then '2: <50% off' else '3: 50%+ off' end as discount_band
            from fct_renewal_decisions
            where decision_month between date '2016-01-01' and date '2017-02-01'
        ),
        long as (
            select 'Auto-renew'            as driver, case when is_auto_renew then 'on' else 'off' end as bucket, churned from d
            union all select 'Cancelled before expiry', case when cancelled_before_expiry then 'yes' else 'no' end, churned from d
            union all select 'Plan length', plan_length, churned from d
            union all select 'Tenure', tenure_band, churned from d
            union all select 'Listening days (last month)', listening_days_band, churned from d
            union all select 'Discount', discount_band, churned from d
            union all select 'Returning subscriber', case when is_returning_subscriber then 'yes' else 'no' end, churned from d
        )
        select driver, bucket, count(*) as decisions, avg(churned::int) as churn_rate
        from long group by all having count(*) >= {min_group}
        order by driver, bucket""",

    # Voluntary vs passive churn among churners, by month.
    "churn_mix": """
        select decision_month,
               count(*) filter (where churned)                                          as churners,
               count(*) filter (where churned and cancelled_before_expiry)              as cancelled,
               count(*) filter (where churned and not cancelled_before_expiry and not is_auto_renew) as did_not_renew,
               count(*) filter (where churned and not cancelled_before_expiry and is_auto_renew)     as auto_renew_lapsed
        from fct_renewal_decisions
        where decision_month between date '2016-01-01' and date '2017-02-01'
        group by 1 order by 1""",

    "model_metrics": "select * from analysis.model_metrics",
    "model_lift": "select * from analysis.model_lift",
    "model_coefficients": "select * from analysis.model_coefficients",

    # Does our churn definition reproduce Kaggle's labels for Feb-2017 expiries?
    "label_agreement": """
        with ours as (
            select msno, arg_max(churned, decision_date) as churned
            from fct_renewal_decisions
            where decision_month = date '2017-02-01'
            group by 1
        )
        select count(*) as members,
               avg((o.churned = l.is_churn)::int) as agreement,
               avg(l.is_churn::int)               as kaggle_churn_rate,
               avg(o.churned::int)                as our_churn_rate
        from ours o join stg_competition_labels l using (msno)
        where l.label_set = 'train'""",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(ROOT / "data" / "warehouse.duckdb"))
    ap.add_argument("--source", default="kkbox", choices=["kkbox", "fixture"],
                    help="stamped into meta.json; the site shows a banner for 'fixture'")
    ap.add_argument("--min-group", type=int, default=MIN_GROUP,
                    help="smallest group exported (privacy floor; lower only for the fixture)")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(a.db, read_only=True)
    for name, sql in TABLES.items():
        df = con.execute(sql.format(min_group=a.min_group)).df()
        for col in df.select_dtypes(include=["datetime", "datetimetz"]).columns:
            df[col] = df[col].dt.strftime("%Y-%m-%d")
        (OUT / f"{name}.json").write_text(df.to_json(orient="records", double_precision=6))
        print(f"{name:<20} {len(df):>6,} rows")
    con.close()
    (OUT / "meta.json").write_text(json.dumps({
        "source": a.source,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    }))


if __name__ == "__main__":
    main()
