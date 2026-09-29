-- Monthly MRR bridge: beginning + new + reactivation + expansion
--                     - contraction - churn = ending.   (tested)
-- Retention is reported two ways:
--   *_monthly — one-month window (easy to misread; ~1pp/month compounds fast)
--   *_t12m    — the standard definition: revenue today from the members who
--               were paying 12 months ago, divided by what they paid then.
with m as (
    select
        month,
        sum(prev_mrr_ntd)                                                 as beginning_mrr,
        sum(mrr_ntd)                                                      as ending_mrr,
        sum(mrr_ntd)      filter (where movement = 'new')                 as new_mrr,
        sum(mrr_ntd)      filter (where movement = 'reactivation')        as reactivation_mrr,
        sum(mrr_change_ntd) filter (where movement = 'expansion')         as expansion_mrr,
        -sum(mrr_change_ntd) filter (where movement = 'contraction')      as contraction_mrr,
        sum(prev_mrr_ntd) filter (where movement = 'churned')             as churned_mrr,
        count(*) filter (where prev_mrr_ntd > 0)                          as beginning_subscribers,
        count(*) filter (where mrr_ntd > 0)                               as ending_subscribers,
        count(*) filter (where movement = 'new')                          as new_subscribers,
        count(*) filter (where movement = 'reactivation')                 as reactivated_subscribers,
        count(*) filter (where movement = 'churned')                      as churned_subscribers
    from {{ ref('fct_subscriber_months') }}
    group by 1
),
t12m as (
    select
        cur.month,
        sum(cur.mrr_ntd) / sum(base.mrr_ntd)                              as nrr_t12m,
        sum(least(cur.mrr_ntd, base.mrr_ntd)) / sum(base.mrr_ntd)         as grr_t12m
    from {{ ref('fct_subscriber_months') }} base
    join {{ ref('fct_subscriber_months') }} cur
      on cur.msno = base.msno and cur.month = base.month + interval 12 month
    where base.mrr_ntd > 0
    group by 1
)
select
    m.month,
    coalesce(m.beginning_mrr, 0)      as beginning_mrr_ntd,
    coalesce(m.new_mrr, 0)            as new_mrr_ntd,
    coalesce(m.reactivation_mrr, 0)   as reactivation_mrr_ntd,
    coalesce(m.expansion_mrr, 0)      as expansion_mrr_ntd,
    coalesce(m.contraction_mrr, 0)    as contraction_mrr_ntd,
    coalesce(m.churned_mrr, 0)        as churned_mrr_ntd,
    coalesce(m.ending_mrr, 0)         as ending_mrr_ntd,
    m.beginning_subscribers,
    m.new_subscribers,
    m.reactivated_subscribers,
    m.churned_subscribers,
    m.ending_subscribers,
    m.churned_subscribers / nullif(m.beginning_subscribers, 0)                  as logo_churn_rate,
    (m.beginning_mrr + coalesce(m.expansion_mrr, 0) - coalesce(m.contraction_mrr, 0)
        - coalesce(m.churned_mrr, 0)) / nullif(m.beginning_mrr, 0)              as nrr_monthly,
    (m.beginning_mrr - coalesce(m.contraction_mrr, 0) - coalesce(m.churned_mrr, 0))
        / nullif(m.beginning_mrr, 0)                                            as grr_monthly,
    t.nrr_t12m,
    t.grr_t12m,
    m.ending_mrr / nullif(m.ending_subscribers, 0)                              as arpu_ntd
from m
left join t12m t using (month)
order by month
