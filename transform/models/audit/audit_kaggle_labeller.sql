-- Kaggle's official labelling code (WSDMChurnLabeller.scala, shipped with the
-- competition data) re-implemented in SQL, for the February 2017 label set:
--   history    = transactions dated Jan 2017
--   candidates = members whose last expiry (from history) falls in Feb 2017
--   churn      = no non-cancel transaction after Jan 31, or the first one comes
--                >= 30 days after expiry (cancellations after Jan 31 pull expiry earlier)
-- Used only to audit our own churn definition in fct_renewal_decisions.
with t as (
    select * from {{ ref('stg_transactions') }}
),
history as (
    select
        msno,
        -- The labeller's ordering keeps the last event: latest date; on the same
        -- day a cancel follows the subscription; repeated cancels keep the
        -- earliest expiry, repeated renewals the latest.
        arg_max(expire_date, (transaction_date, is_cancel::int,
                case when is_cancel then -epoch(expire_date) else epoch(expire_date) end)) as last_expire
    from t
    where transaction_date between date '2017-01-01' and date '2017-01-31'
    group by 1
),
candidates as (
    select * from history where last_expire between date '2017-02-01' and date '2017-02-28'
),
future as (
    select t.* from t join candidates using (msno) where t.transaction_date > date '2017-01-31'
),
first_renewal as (
    select msno, min(transaction_date) as renewal_date from future where not is_cancel group by 1
),
effective as (
    select
        c.msno,
        c.last_expire,
        r.renewal_date,
        least(c.last_expire, coalesce(min(f.expire_date) filter (
            where f.is_cancel and (r.renewal_date is null or f.transaction_date < r.renewal_date)),
            c.last_expire)) as effective_expire
    from candidates c
    left join first_renewal r using (msno)
    left join future f using (msno)
    group by 1, 2, 3
)
select
    msno,
    last_expire,
    effective_expire,
    renewal_date,
    (renewal_date is null or date_diff('day', effective_expire, renewal_date) >= 30) as is_churn
from effective
