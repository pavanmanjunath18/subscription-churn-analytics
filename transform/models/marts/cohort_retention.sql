-- Logo and revenue retention by first-paid-month cohort. Only cells that are
-- fully observable are emitted (the triangle), so averages are not biased by
-- young cohorts.
with cohorts as (
    select cohort_month, count(distinct msno) as cohort_size,
           sum(mrr_ntd) filter (where months_since_start = 0) as cohort_mrr
    from {{ ref('fct_subscriber_months') }}
    group by 1
)
select
    f.cohort_month,
    f.months_since_start,
    c.cohort_size,
    count(*) filter (where f.mrr_ntd > 0)                 as retained_subscribers,
    count(*) filter (where f.mrr_ntd > 0) / c.cohort_size  as logo_retention,
    sum(f.mrr_ntd) / c.cohort_mrr                          as revenue_retention
from {{ ref('fct_subscriber_months') }} f
join cohorts c using (cohort_month)
group by f.cohort_month, f.months_since_start, c.cohort_size, c.cohort_mrr
order by 1, 2
