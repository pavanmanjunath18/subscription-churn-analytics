#!/usr/bin/env python3
"""
Out-of-time churn backtest on fct_renewal_decisions.

Question: at the moment a paid period is about to expire, how well can we tell
who will not renew — and how much of that comes from listening behaviour
rather than billing flags we'd see anyway?

Split by decision month (never random — that would leak the future):
    train      2016-01 .. 2016-09
    validation 2016-10 .. 2016-12   (model/threshold choices)
    test       2017-01 .. 2017-02   (reported numbers; touched once)

Writes result tables into the warehouse's `analysis` schema.
    python analysis/churn_model.py [--db data/warehouse.duckdb] [--sample 2000000]
"""
import argparse

import duckdb
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

SPLITS = {
    "train":      ("2016-01-01", "2016-09-01"),
    "validation": ("2016-10-01", "2016-12-01"),
    "test":       ("2017-01-01", "2017-02-01"),
}

ENGAGEMENT = ["days_active_last_month", "hours_last_month", "completion_rate_last_month",
              "early_skip_rate_last_month", "hours_trend_ratio", "hours_prior_3m_avg"]
ACCOUNT = ["tenure_months", "period_in_spell", "discount_pct", "monthly_price_ntd", "age"]
FLAGS = ["is_auto_renew", "cancelled_before_expiry", "is_returning_subscriber"]
CATEGORICAL = ["plan_bucket", "payment_method_bucket", "registered_via"]

FEATURE_SETS = {
    "all_features": ENGAGEMENT + ACCOUNT + FLAGS + CATEGORICAL,
    "engagement_only": ENGAGEMENT + ["tenure_months", "age"],
}


def load(db, sample):
    con = duckdb.connect(db, read_only=True)
    df = con.execute(f"""
        select *,
               case when plan_days <= 7 then '<=7d' when plan_days <= 31 then '30d'
                    when plan_days <= 100 then '90d' else '180d+' end         as plan_bucket
        from fct_renewal_decisions
        where decision_month between date '{SPLITS['train'][0]}' and date '{SPLITS['test'][1]}'
        {f"using sample {sample} rows (reservoir, 42)" if sample else ""}
    """).df()
    con.close()
    top = df["payment_method_id"].value_counts().index[:8]
    df["payment_method_bucket"] = np.where(df["payment_method_id"].isin(top),
                                           df["payment_method_id"].astype("Int64").astype(str), "other")
    df["registered_via"] = df["registered_via"].astype("Int64").astype(str)
    for c in FLAGS:
        df[c] = df[c].astype(float)
    df["hours_trend_ratio"] = df["hours_trend_ratio"].clip(upper=5)
    df["split"] = None
    for name, (lo, hi) in SPLITS.items():
        m = df["decision_month"].between(pd.Timestamp(lo), pd.Timestamp(hi))
        df.loc[m, "split"] = name
    return df


def rule_score(df):
    """The kind of score a CS team writes without a model: points for red flags."""
    return (3.0 * df["cancelled_before_expiry"]
            + 2.0 * (1 - df["is_auto_renew"])
            + 1.0 * (df["days_active_last_month"] == 0)
            + 1.0 * (df["hours_trend_ratio"].fillna(1) < 0.5)
            + 0.5 * (df["tenure_months"] < 3))


def make_models(features):
    num = [f for f in features if f not in CATEGORICAL]
    cat = [f for f in features if f in CATEGORICAL]
    pre = ColumnTransformer([
        ("num", make_pipeline(SimpleImputer(strategy="median", add_indicator=True), StandardScaler()), num),
        ("cat", OneHotEncoder(handle_unknown="ignore", min_frequency=50), cat),
    ])
    return {
        "logistic_regression": make_pipeline(pre, LogisticRegression(max_iter=2000, C=0.5)),
        "gradient_boosting": make_pipeline(pre, HistGradientBoostingClassifier(
            max_iter=300, learning_rate=0.08, early_stopping=True, random_state=42)),
    }


def lift_table(y, score, model, feature_set, n=10):
    d = pd.DataFrame({"y": y, "s": score}).sort_values("s", ascending=False).reset_index(drop=True)
    d["decile"] = (np.arange(len(d)) * n // len(d)) + 1
    t = d.groupby("decile").agg(members=("y", "size"), churners=("y", "sum"), churn_rate=("y", "mean"))
    t["lift"] = t["churn_rate"] / d["y"].mean()
    t["cumulative_capture"] = t["churners"].cumsum() / d["y"].sum()
    t = t.reset_index()
    t["model"], t["feature_set"] = model, feature_set
    return t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="data/warehouse.duckdb")
    ap.add_argument("--sample", type=int, default=2_000_000,
                    help="reservoir-sample rows for fitting speed; 0 = all")
    a = ap.parse_args()

    df = load(a.db, a.sample)
    train, valid, test = (df[df["split"] == s] for s in ("train", "validation", "test"))
    print(f"rows  train={len(train):,}  validation={len(valid):,}  test={len(test):,}")
    print(f"churn rate  train={train.churned.mean():.3f}  test={test.churned.mean():.3f}")

    metrics, lifts, coefs = [], [], []

    s = rule_score(test)
    metrics.append(dict(model="rule_score", feature_set="rules",
                        test_auc=roc_auc_score(test.churned, s),
                        test_pr_auc=average_precision_score(test.churned, s),
                        validation_auc=roc_auc_score(valid.churned, rule_score(valid))))
    lifts.append(lift_table(test.churned.values, s.values, "rule_score", "rules"))

    for fs_name, feats in FEATURE_SETS.items():
        for m_name, model in make_models(feats).items():
            model.fit(train[feats], train.churned)
            p_test = model.predict_proba(test[feats])[:, 1]
            p_val = model.predict_proba(valid[feats])[:, 1]
            metrics.append(dict(model=m_name, feature_set=fs_name,
                                test_auc=roc_auc_score(test.churned, p_test),
                                test_pr_auc=average_precision_score(test.churned, p_test),
                                validation_auc=roc_auc_score(valid.churned, p_val)))
            lifts.append(lift_table(test.churned.values, p_test, m_name, fs_name))
            if m_name == "logistic_regression":
                pre, lr = model[0], model[-1]
                coefs.append(pd.DataFrame({
                    "feature": pre.get_feature_names_out(),
                    "coefficient": lr.coef_[0],
                    "odds_ratio_per_sd": np.exp(lr.coef_[0]),
                    "feature_set": fs_name,
                }))

    metrics = pd.DataFrame(metrics)
    metrics["test_base_rate"] = test.churned.mean()
    lifts, coefs = pd.concat(lifts), pd.concat(coefs)
    print(metrics.round(3).to_string(index=False))

    con = duckdb.connect(a.db)
    con.execute("create schema if not exists analysis")
    for name, frame in {"model_metrics": metrics, "model_lift": lifts, "model_coefficients": coefs}.items():
        con.register("frame", frame)
        con.execute(f"create or replace table analysis.{name} as select * from frame")
        con.unregister("frame")
    con.close()


if __name__ == "__main__":
    main()
