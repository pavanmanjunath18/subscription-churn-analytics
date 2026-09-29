-- Billing events numbered into subscription "spells" (gaps-and-islands).
-- A new spell starts when a member's coverage has lapsed for longer than the
-- grace period: that lapse is a churn, and the new spell is a reactivation.
-- Exception: lapses explained by a hole in the billing export (is_gap_bridged).
with ordered as (
    select
        *,
        lag(expire_date) over (partition by msno order by transaction_date)       as prev_expire_date,
        lag(payment_method_id) over (partition by msno order by transaction_date) as prev_payment_method_id
    from {{ ref('int_billing_events') }}
),
lapses as (
    select
        *,
        -- >= : a renewal exactly 30 days late is churn, as in Kaggle's labeller
        prev_expire_date is not null
          and transaction_date >= prev_expire_date + interval {{ var('churn_grace_days') }} day as is_lapse
    from ordered
),
bridged as (
    select
        l.*,
        -- The lapse overlaps a month where the member's payment method has no
        -- data (int_billing_data_gaps), and the member reappears: the renewals
        -- were almost certainly made but not exported, so bridge the gap.
        l.is_lapse and exists (
            select 1 from {{ ref('int_billing_data_gaps') }} g
            where g.payment_method_id = l.prev_payment_method_id
              and g.month between date_trunc('month', l.prev_expire_date)
                              and date_trunc('month', l.transaction_date - interval 1 day)
        )                                                                   as is_gap_bridged
    from lapses l
),
flagged as (
    select
        *,
        case when prev_expire_date is null then 1
             when is_lapse and not is_gap_bridged then 1
             else 0 end                                                     as starts_spell
    from bridged
)
select
    *,
    sum(starts_spell) over (partition by msno order by transaction_date) as spell_number
from flagged
