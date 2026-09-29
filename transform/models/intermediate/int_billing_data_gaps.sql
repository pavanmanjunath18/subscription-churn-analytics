-- Payment-method-months where the transaction feed is mostly missing: under
-- 25% of that method's typical monthly volume. KKBox's export has several such
-- holes (e.g. method 39 drops from ~76K to ~4K transactions a month in
-- Feb-Jun 2016 while its members keep listening at their usual rate, then
-- snaps back in July). Without handling them, missing renewals look like mass
-- churn followed by mass reactivation.
with monthly as (
    select
        payment_method_id,
        date_trunc('month', transaction_date)::date as month,
        count(*)                                    as transactions
    from {{ ref('stg_transactions') }}
    where transaction_date < date '{{ var("data_end_date") }}' - interval 30 day
    group by 1, 2
),
typical as (
    select payment_method_id, median(transactions) as median_transactions
    from monthly
    group by 1
    having median(transactions) >= 5000   -- ignore small methods: too noisy to call a gap
)
select
    m.payment_method_id,
    m.month,
    m.transactions,
    t.median_transactions,
    m.transactions / t.median_transactions as volume_ratio
from monthly m
join typical t using (payment_method_id)
where m.transactions < 0.25 * t.median_transactions
