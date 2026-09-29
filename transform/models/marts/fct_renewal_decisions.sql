-- One row per paid period at the moment it expires: did the member renew
-- (a later paid period in the same spell) or churn (spell ended)?
-- Features describe only what was knowable before the expiry month.
-- This is the table the churn model and the risk score are evaluated on.
with events as (
    select
        e.*,
        -- Is there another paid period later in this spell?
        max(case when e.is_paid then e.transaction_date end) over (
            partition by e.msno, e.spell_number
            order by e.transaction_date
            rows between 1 following and unbounded following)               as next_paid_date,
        -- Did the member cancel before this period ran out?
        bool_or(e.is_cancel) over (
            partition by e.msno, e.spell_number
            order by e.transaction_date
            rows between 1 following and unbounded following)               as cancelled_after,
        min(e.transaction_date) filter (where e.is_paid) over (partition by e.msno) as first_paid_date,
        count(*) filter (where e.is_paid) over (
            partition by e.msno, e.spell_number order by e.transaction_date)  as period_in_spell
    from {{ ref('int_billing_events_sequenced') }} e
),
paid as (
    select
        ev.*,
        s.spell_end,
        s.is_censored,
        -- The decision date: when this period (or the spell, if it's the last) runs out.
        case when ev.next_paid_date is null then s.spell_end else ev.expire_date end as decision_date
    from events ev
    join {{ ref('int_subscription_spells') }} s using (msno, spell_number)
    where ev.is_paid
),
logs as (
    select * from {{ ref('stg_user_logs_monthly') }}
),
labelled as (
    select
        p.msno,
        p.spell_number,
        p.transaction_date                                    as period_start,
        p.decision_date,
        date_trunc('month', p.decision_date)::date            as decision_month,
        (p.next_paid_date is null)                            as churned,
        p.plan_days,
        p.monthly_price_ntd,
        p.discount_pct,
        p.is_auto_renew,
        p.payment_method_id,
        coalesce(p.cancelled_after and p.next_paid_date is null, false) as cancelled_before_expiry,
        date_diff('month', p.first_paid_date, p.decision_date)          as tenure_months,
        p.spell_number > 1                                    as is_returning_subscriber,
        p.period_in_spell
    from paid p
    where not (p.next_paid_date is null and p.is_censored)   -- outcome unknown
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
