-- How well do three churn labels for Feb-2017 expiries agree?
--   ours     : fct_renewal_decisions (this pipeline)
--   labeller : Kaggle's labelling code, re-implemented (audit_kaggle_labeller)
--   v1       : the labels Kaggle published in train.csv
with ours as (
    select msno, arg_max(churned, decision_date) as churned
    from {{ ref('fct_renewal_decisions') }}
    where decision_month = date '2017-02-01'
    group by 1
),
labeller as (select msno, is_churn from {{ ref('audit_kaggle_labeller') }}),
v1 as (select msno, is_churn from {{ ref('stg_competition_labels') }} where label_set = 'train'),
pairs as (
    select 'Our pipeline vs Kaggle labelling code' as comparison, o.churned as a, l.is_churn as b
    from ours o join labeller l using (msno)
    union all
    select 'Published v1 labels vs Kaggle labelling code', v.is_churn, l.is_churn
    from v1 v join labeller l using (msno)
    union all
    select 'Our pipeline vs published v1 labels', o.churned, v.is_churn
    from ours o join v1 v using (msno)
)
select
    comparison,
    count(*)                                         as members,
    avg((a = b)::int)                                as agreement,
    avg(a::int)                                      as churn_rate_first,
    avg(b::int)                                      as churn_rate_second,
    -- treating the second label as truth
    count(*) filter (where a and b) / nullif(count(*) filter (where a), 0)::double as precision,
    count(*) filter (where a and b) / nullif(count(*) filter (where b), 0)::double as recall
from pairs
group by 1
