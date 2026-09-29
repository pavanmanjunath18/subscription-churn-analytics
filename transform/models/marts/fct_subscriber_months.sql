-- One row per member per month from their first paying month onwards, only
-- where something is true: they paid this month or last month. Classifies
-- every month-over-month revenue movement.
with spine as (
    select month::date as month
    from range(date '{{ var("first_month") }}', date '{{ var("last_complete_month") }}' + interval 1 month,
               interval 1 month) t(month)
),
first_paid as (
    select msno, min(month) as cohort_month from {{ ref('int_paying_months') }} group by 1
),
grid as (
    select f.msno, f.cohort_month, s.month
    from first_paid f join spine s on s.month >= f.cohort_month
),
filled as (
    select
        g.msno, g.cohort_month, g.month,
        coalesce(p.mrr_ntd, 0)                                             as mrr_ntd,
        p.plan_days, p.is_auto_renew, p.payment_method_id, p.discount_pct,
        lag(coalesce(p.mrr_ntd, 0)) over (partition by g.msno order by g.month) as prev_mrr_ntd
    from grid g
    left join {{ ref('int_paying_months') }} p using (msno, month)
)
select
    msno,
    cohort_month,
    month,
    date_diff('month', cohort_month, month)       as months_since_start,
    mrr_ntd,
    coalesce(prev_mrr_ntd, 0)                     as prev_mrr_ntd,
    mrr_ntd - coalesce(prev_mrr_ntd, 0)           as mrr_change_ntd,
    plan_days, is_auto_renew, payment_method_id, discount_pct,
    case
        when prev_mrr_ntd is null                     then 'new'
        when prev_mrr_ntd = 0 and mrr_ntd > 0         then 'reactivation'
        when prev_mrr_ntd > 0 and mrr_ntd = 0         then 'churned'
        when mrr_ntd > prev_mrr_ntd                   then 'expansion'
        when mrr_ntd < prev_mrr_ntd                   then 'contraction'
        else                                               'retained'
    end                                           as movement
from filled
where mrr_ntd > 0 or coalesce(prev_mrr_ntd, 0) > 0
