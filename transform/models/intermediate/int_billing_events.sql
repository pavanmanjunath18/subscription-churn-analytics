-- Paid periods and cancellations, collapsed to one event per member per day.
-- Same-day ties are common (a renewal and a cancel on the same date); the
-- cancellation wins because it is the later state change.
with events as (
    select *
    from {{ ref('stg_transactions') }}
    where (is_paid or is_cancel) and not is_date_anomaly
)
select
    msno,
    transaction_date,
    bool_or(is_cancel)                                              as is_cancel,
    bool_or(is_paid)                                                as is_paid,
    case when bool_or(is_cancel)
         then min(expire_date) filter (where is_cancel)
         else max(expire_date) end                                   as expire_date,
    max(monthly_price_ntd)                                          as monthly_price_ntd,
    arg_max(plan_days, expire_date) filter (where is_paid)          as plan_days,
    arg_max(is_auto_renew, expire_date) filter (where is_paid)      as is_auto_renew,
    arg_max(payment_method_id, expire_date) filter (where is_paid)  as payment_method_id,
    arg_max(discount_pct, expire_date) filter (where is_paid)       as discount_pct
from events
group by 1, 2
