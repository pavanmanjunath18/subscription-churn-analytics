#!/usr/bin/env bash
# Download the KKBox competition files and stage them as Parquet.
#
# Prerequisites (one-time, done by you in a browser):
#   1. Accept the rules at https://www.kaggle.com/competitions/kkbox-churn-prediction-challenge/rules
#   2. Create an API token (kaggle.com -> Settings -> API) and save it to ~/.kaggle/kaggle.json
#   3. brew install sevenzip   (provides `7zz`)
#
# Disk: the big user log is streamed out of its archive straight into DuckDB,
# so the ~30 GB CSV is never written. Peak usage is roughly the archives (~9 GB)
# plus DuckDB spill space.
set -euo pipefail
cd "$(dirname "$0")/.."
COMP=kkbox-churn-prediction-challenge
RAW=data/raw
PY=.pyenv/bin/python
KAGGLE=.pyenv/bin/kaggle
mkdir -p "$RAW"

fetch() {  # fetch <archive name>; Kaggle may wrap single files in a .zip
  local f=$1
  [ -f "$RAW/$f" ] && return
  "$KAGGLE" competitions download -c "$COMP" -f "$f" -p "$RAW" --quiet
  if [ -f "$RAW/$f.zip" ]; then unzip -q -o "$RAW/$f.zip" -d "$RAW" && rm "$RAW/$f.zip"; fi
}

extract() {  # extract <archive> -> csv next to it (small files only)
  7zz e -y -o"$RAW" "$RAW/$1" >/dev/null
}

echo "== files available =="
"$KAGGLE" competitions files -c "$COMP"

for f in members_v3.csv.7z transactions.csv.7z transactions_v2.csv.7z train.csv.7z train_v2.csv.7z user_logs_v2.csv.7z user_logs.csv.7z; do
  echo "fetch $f"; fetch "$f"
done

# Some archives unpack into nested folders (e.g. data/churn_comp_refresh/),
# so locate each CSV after extraction instead of assuming a path.
csv() { find "$RAW" -name "$1" -type f | head -1; }

echo "== staging =="
for a in members_v3 transactions transactions_v2 train train_v2 user_logs_v2; do
  [ -n "$(csv "$a.csv")" ] || extract "$a.csv.7z"
done
$PY scripts/ingest.py members      "$(csv members_v3.csv)"
$PY scripts/ingest.py transactions "$(csv transactions.csv)" "$(csv transactions_v2.csv)"
$PY scripts/ingest.py labels       "$(csv train.csv)" "$(csv train_v2.csv)"
$PY scripts/ingest.py user_logs    "$(csv user_logs_v2.csv)" --part v2
echo "streaming user_logs.csv.7z (the long one: ~400M rows, never written to disk)"
7zz e -so "$RAW/user_logs.csv.7z" | $PY scripts/ingest.py user_logs /dev/stdin --part v1
echo "done: data/staged/"
