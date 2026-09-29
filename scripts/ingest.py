#!/usr/bin/env python3
"""
Raw KKBox CSVs -> typed Parquet in data/staged/.

    python scripts/ingest.py members       data/raw/members_v3.csv
    python scripts/ingest.py transactions  data/raw/transactions.csv data/raw/transactions_v2.csv
    python scripts/ingest.py labels        data/raw/train.csv data/raw/train_v2.csv
    7zz e -so data/raw/user_logs.csv.7z | python scripts/ingest.py user_logs /dev/stdin --part v1
    python scripts/ingest.py user_logs     data/raw/user_logs_v2.csv --part v2

user_logs.csv is ~30 GB uncompressed (~400M daily rows). It is never written to
disk: it is streamed from the archive and collapsed to one row per user-month,
which is the grain every downstream model needs.
"""
import argparse
import os
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
# STAGED_DIR lets CI build the fixture into its own folder.
STAGED = Path(os.environ.get("STAGED_DIR", ROOT / "data" / "staged"))

# KKBox stores dates as integers like 20170131.
DATE = "strptime(CAST({c} AS VARCHAR), '%Y%m%d')::DATE"


def connect():
    con = duckdb.connect()
    tmp = ROOT / "data" / "tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    con.execute(f"SET temp_directory = '{tmp}'")
    con.execute("SET preserve_insertion_order = false")  # lets large aggregations stream
    return con


def csv(path):
    return f"read_csv('{path}', header = true, auto_detect = true)"


def members(con, paths):
    con.execute(f"""
        COPY (
            SELECT msno,
                   city,
                   bd                                 AS age_raw,
                   NULLIF(gender, '')                 AS gender,
                   registered_via,
                   {DATE.format(c='registration_init_time')} AS registration_date
            FROM {csv(paths[0])}
        ) TO '{STAGED}/members.parquet' (FORMAT parquet)
    """)


def transactions(con, paths):
    union = " UNION ALL ".join(f"SELECT * FROM {csv(p)}" for p in paths)
    # v2 re-ships some v1 rows; DISTINCT removes exact duplicates only.
    con.execute(f"""
        COPY (
            SELECT DISTINCT
                   msno,
                   payment_method_id,
                   payment_plan_days,
                   plan_list_price,
                   actual_amount_paid,
                   is_auto_renew::BOOLEAN              AS is_auto_renew,
                   {DATE.format(c='transaction_date')}       AS transaction_date,
                   {DATE.format(c='membership_expire_date')} AS membership_expire_date,
                   is_cancel::BOOLEAN                  AS is_cancel
            FROM ({union})
        ) TO '{STAGED}/transactions.parquet' (FORMAT parquet)
    """)


def labels(con, paths):
    parts = [f"SELECT msno, is_churn, '{Path(p).stem}' AS label_set FROM {csv(p)}" for p in paths]
    con.execute(f"""
        COPY ({" UNION ALL ".join(parts)})
        TO '{STAGED}/competition_labels.parquet' (FORMAT parquet)
    """)


def user_logs(con, paths, part):
    """Two passes, so memory stays flat on a 16 GB laptop:
    1. stream raw daily rows into Parquet partitioned by month (no aggregation);
    2. collapse one month at a time to member-months (~1M groups each).
    A single GROUP BY over the whole ~400M-row log runs out of memory, and a
    pipe from 7zz can only be read once, so pass 1 is what makes pass 2 safe.
    """
    import shutil

    out = STAGED / "user_logs_monthly"
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob(f"{part}*.parquet"):  # a rerun must replace, not add to, earlier output
        old.unlink()
    tmp = ROOT / "data" / "tmp" / f"user_logs_{part}"
    shutil.rmtree(tmp, ignore_errors=True)
    src = (f"read_csv('{paths[0]}', header = true, columns = {{"
           "'msno': 'VARCHAR', 'date': 'INTEGER', 'num_25': 'INTEGER', 'num_50': 'INTEGER',"
           "'num_75': 'INTEGER', 'num_985': 'INTEGER', 'num_100': 'INTEGER',"
           "'num_unq': 'INTEGER', 'total_secs': 'DOUBLE'})")
    con.execute(f"""
        COPY (SELECT *, date // 100 AS ym FROM {src})
        TO '{tmp}' (FORMAT parquet, PARTITION_BY (ym))
    """)
    for d in sorted(tmp.glob("ym=*")):
        ym = int(d.name.split("=")[1])
        con.execute(f"""
            COPY (
                SELECT msno,
                       make_date({ym // 100}, {ym % 100}, 1)        AS month,
                       COUNT(*)                                  AS days_active,
                       SUM(num_25 + num_50 + num_75 + num_985 + num_100) AS songs_played,
                       SUM(num_100)                              AS songs_completed,
                       SUM(num_25)                               AS songs_skipped_early,
                       SUM(num_unq)                              AS unique_songs,
                       -- total_secs has a handful of absurd negative/huge values
                       SUM(LEAST(GREATEST(total_secs, 0), 86400)) / 3600.0 AS hours_listened
                FROM read_parquet('{d}/*.parquet')
                GROUP BY 1, 2
            ) TO '{out}/{part}_{ym}.parquet' (FORMAT parquet)
        """)
        print(f"   {part} {ym}")
    shutil.rmtree(tmp)

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("table", choices=["members", "transactions", "labels", "user_logs"])
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--part", default="v1", help="output file name for user_logs")
    a = ap.parse_args()
    STAGED.mkdir(parents=True, exist_ok=True)
    con = connect()
    if a.table == "user_logs":
        user_logs(con, a.paths, a.part)
    else:
        globals()[a.table](con, a.paths)
    print(f"ok  {a.table}")
