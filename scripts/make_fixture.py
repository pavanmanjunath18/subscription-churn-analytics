#!/usr/bin/env python3
"""
Write a tiny dataset in the exact raw KKBox CSV format to data/fixture/raw/.

It exists so the dbt models and their tests can run in CI (and on a laptop)
without the 30 GB Kaggle download. Values are random; nothing here is analysed.
It deliberately includes the awkward cases the real data has: free trials
(amount 0), cancellations, lapses and returns, plan changes, duplicate rows.
"""
import csv
import random
from datetime import date, timedelta
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "fixture" / "raw"
random.seed(7)

START, END = date(2015, 1, 1), date(2017, 3, 31)
PLANS = [(30, 149, 149), (30, 149, 129), (30, 180, 180), (90, 447, 447), (7, 0, 0)]


def d(x):
    return x.strftime("%Y%m%d")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    members, txns, logs, labels = [], [], [], []

    for i in range(400):
        msno = f"user{i:04d}"
        reg = START + timedelta(days=random.randint(0, 700))
        members.append([msno, random.randint(1, 22), random.choice([0, 0, 22, 28, 35, 1051]),
                        random.choice(["male", "female", ""]), random.choice([3, 4, 7, 9]), d(reg)])

        auto = random.random() < 0.7
        method = random.choice([41, 41, 40, 36, 38])
        day = reg
        if random.random() < 0.3:  # free trial first
            txns.append([msno, method, 7, 0, 0, 0, d(day), d(day + timedelta(days=7)), 0])
            day += timedelta(days=7)

        churn_p = 0.02 if auto else 0.12
        while day <= END:
            plan_days, list_price, paid = random.choice(PLANS[:4])
            expire = day + timedelta(days=plan_days)
            txns.append([msno, method, plan_days, list_price, paid, int(auto), d(day), d(expire), 0])
            if random.random() < 0.01:   # exact duplicate row, as in the raw data
                txns.append(txns[-1])
            if random.random() < churn_p:
                if random.random() < 0.5:  # explicit cancel: expiry pulled in
                    cancel_day = min(day + timedelta(days=random.randint(1, plan_days - 1)), END)
                    txns.append([msno, method, plan_days, list_price, paid, 0,
                                 d(cancel_day), d(cancel_day), 1])
                    expire = cancel_day
                gap = random.choice([400, 400, 45, 20])  # most never return
                day = expire + timedelta(days=gap)
                auto = random.random() < 0.5
                continue
            day = expire

        # a few days of listening per month while subscribed
        cur = reg
        while cur <= END:
            if random.random() < 0.35:
                n = [random.randint(0, 20) for _ in range(5)]
                logs.append([msno, d(cur), *n, random.randint(1, sum(n) + 1),
                             round(random.uniform(60, 20000), 3)])
            cur += timedelta(days=random.randint(1, 6))
        labels.append([msno, int(random.random() < 0.1)])

    files = {
        "members_v3.csv": (["msno", "city", "bd", "gender", "registered_via",
                            "registration_init_time"], members),
        "transactions.csv": (["msno", "payment_method_id", "payment_plan_days", "plan_list_price",
                              "actual_amount_paid", "is_auto_renew", "transaction_date",
                              "membership_expire_date", "is_cancel"], txns),
        "user_logs.csv": (["msno", "date", "num_25", "num_50", "num_75", "num_985", "num_100",
                           "num_unq", "total_secs"], logs),
        "train_v2.csv": (["msno", "is_churn"], labels),
    }
    for name, (header, rows) in files.items():
        with open(OUT / name, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(header)
            w.writerows(rows)
        print(f"{name:<20} {len(rows):>7,} rows")


if __name__ == "__main__":
    main()
