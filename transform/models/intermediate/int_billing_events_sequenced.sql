-- Billing events numbered into subscription "spells" (gaps-and-islands).
-- A new spell starts when a member's coverage has lapsed for longer than the
-- grace period: that lapse is a churn, and the new spell is a reactivation.
with ordered as (
    select
        *,
        lag(expire_date) over (partition by msno order by transaction_date) as prev_expire_date
    from {{ ref('int_billing_events') }}
),
flagged as (
    select
        *,
        case when prev_expire_date is null
               or transaction_date > prev_expire_date + interval {{ var('churn_grace_days') }} day
             then 1 else 0 end as starts_spell
    from ordered
)
select
    *,
    sum(starts_spell) over (partition by msno order by transaction_date) as spell_number
from flagged
