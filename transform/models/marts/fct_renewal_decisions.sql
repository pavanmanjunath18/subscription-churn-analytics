-- One row per paid period at expiry (int_renewal_labels) plus what was known
-- before the decision month: member attributes and listening behaviour.
-- This is the table the churn model and the risk score are evaluated on.
with labelled as (
    select * from {{ ref('int_renewal_labels') }}
),
logs as (
    -- Only the months any decision can look back to.
    select * from {{ ref('stg_user_logs_monthly') }}
    where month >= date '{{ var("analysis_start") }}' - interval 4 month
),
prior as (
    -- Average monthly listening over the three months before the last full
    -- month (months with no activity count as zero).
    select l.msno, l.period_start, sum(x.hours_listened) / 3.0 as hours_prior_3m_avg
    from labelled l
    join logs x
      on x.msno = l.msno
     and x.month between l.decision_month - interval 4 month
                     and l.decision_month - interval 2 month
    group by 1, 2
)
select
    l.*,
    m.age, m.city, m.registered_via, m.gender,

    -- Engagement in the last full month before the decision month ...
    coalesce(l1.days_active, 0)                           as days_active_last_month,
    coalesce(l1.hours_listened, 0)                        as hours_last_month,
    l1.songs_completed / nullif(l1.songs_played, 0)       as completion_rate_last_month,
    l1.songs_skipped_early / nullif(l1.songs_played, 0)   as early_skip_rate_last_month,

    -- ... and its trend against the three months before that.
    coalesce(pr.hours_prior_3m_avg, 0)                    as hours_prior_3m_avg,
    coalesce(l1.hours_listened, 0) / nullif(pr.hours_prior_3m_avg, 0) as hours_trend_ratio
from labelled l
left join {{ ref('stg_members') }} m using (msno)
left join logs l1
       on l1.msno = l.msno and l1.month = l.decision_month - interval 1 month
left join prior pr
       on pr.msno = l.msno and pr.period_start = l.period_start
