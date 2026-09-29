-- One row per paid period at the moment it expires: did the member renew
-- (any later membership period in the same spell, paid or free) or churn?
-- Billing-side facts only; listening features are joined in fct_renewal_decisions.
-- Scoped to decisions from {{ var('analysis_start') }}: the window every
-- downstream use (model backtest, site, Kaggle audit) needs.
with events as (
    select
        e.*,
        -- The next membership period later in this spell (null = the spell ends here).
        min(case when e.is_coverage then e.transaction_date end) over (
            partition by e.msno, e.spell_number
            order by e.transaction_date
            rows between 1 following and unbounded following)               as next_renewal_date,
        -- The first cancellation after this event in the spell.
        min(case when e.is_cancel then e.transaction_date end) over (
            partition by e.msno, e.spell_number
            order by e.transaction_date
            rows between 1 following and unbounded following)               as next_cancel_date,
        min(e.transaction_date) filter (where e.is_paid) over (partition by e.msno) as first_paid_date,
        count(*) filter (where e.is_paid) over (
            partition by e.msno, e.spell_number order by e.transaction_date)  as period_in_spell
    from {{ ref('int_billing_events_sequenced') }} e
),
paid as (
    select
        ev.*,
        -- A cancellation dated after this period began and no later than its
        -- expiry: known at decision time. (Not "cancelled and never renewed",
        -- which would smuggle the churn label into a feature.)
        coalesce(ev.next_cancel_date <= ev.expire_date
                 and (ev.next_renewal_date is null or ev.next_cancel_date < ev.next_renewal_date),
                 false)                                                     as cancelled_before_expiry,
        s.spell_end,
        s.is_censored,
        -- The decision date: when this period (or the spell, if it's the last) runs out.
        case when ev.next_renewal_date is null then s.spell_end else ev.expire_date end as decision_date
    from events ev
    join {{ ref('int_subscription_spells') }} s using (msno, spell_number)
    where ev.is_paid
)

    select
        p.msno,
        p.spell_number,
        p.transaction_date                                    as period_start,
        p.decision_date,
        date_trunc('month', p.decision_date)::date            as decision_month,
        (p.next_renewal_date is null)                            as churned,
        p.plan_days,
        p.monthly_price_ntd,
        p.discount_pct,
        p.is_auto_renew,
        p.payment_method_id,
        p.cancelled_before_expiry,
        date_diff('month', p.first_paid_date, p.decision_date)          as tenure_months,
        p.spell_number > 1                                    as is_returning_subscriber,
        p.period_in_spell
    from paid p
    where not (p.next_renewal_date is null and p.is_censored)   -- outcome unknown
      and p.decision_date >= date '{{ var("analysis_start") }}'
