# Subscription churn analytics — one target per pipeline stage.
PY    := .pyenv/bin/python
DBT   := .pyenv/bin/dbt --no-use-colors
DBTF  := --project-dir transform --profiles-dir transform

.PHONY: setup data warehouse model export site all fixture clean

setup:                      ## Python env + web dependencies
	python3 -m venv .pyenv && $(PY) -m pip install -q -r requirements.txt
	cd web && npm ci

data:                       ## download + stage KKBox (needs Kaggle token, see scripts/fetch_kkbox.sh)
	./scripts/fetch_kkbox.sh

warehouse:                  ## build and test every dbt model
	$(DBT) build $(DBTF)

model:                      ## out-of-time churn backtest -> analysis.* tables
	$(PY) analysis/churn_model.py

export:                     ## aggregate tables -> web/data/*.json
	$(PY) scripts/export_site_data.py --source kkbox

site:                       ## static build -> web/out/
	cd web && npm run build

all: warehouse model export site

# Same pipeline on a tiny synthetic dataset in KKBox's raw format (used by CI).
fixture:
	$(PY) scripts/make_fixture.py
	STAGED_DIR=data/fixture/staged $(PY) scripts/ingest.py members data/fixture/raw/members_v3.csv
	STAGED_DIR=data/fixture/staged $(PY) scripts/ingest.py transactions data/fixture/raw/transactions.csv
	STAGED_DIR=data/fixture/staged $(PY) scripts/ingest.py labels data/fixture/raw/train_v2.csv
	STAGED_DIR=data/fixture/staged $(PY) scripts/ingest.py user_logs data/fixture/raw/user_logs.csv
	STAGED_DIR=data/fixture/staged $(DBT) build $(DBTF) --target fixture
	$(PY) analysis/churn_model.py --db data/fixture/warehouse.duckdb --sample 0
	$(PY) scripts/export_site_data.py --db data/fixture/warehouse.duckdb --source fixture --min-group 5

clean:
	rm -rf data/fixture data/warehouse.duckdb transform/target web/out web/.next
