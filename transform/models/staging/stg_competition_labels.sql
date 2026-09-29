-- Kaggle's own churn labels (train = Feb 2017 expiries, train_v2 = Mar 2017).
-- Used only to sanity-check that our churn definition reproduces theirs.
select msno, is_churn::boolean as is_churn, label_set
from read_parquet({{ staged('competition_labels.parquet') }})
