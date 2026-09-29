-- One row per billing event (payment, renewal, or cancellation).
select
    msno,
    payment_method_id,
    payment_plan_days                                   as plan_days,
    plan_list_price                                     as list_price_ntd,
    actual_amount_paid                                  as amount_paid_ntd,
    is_auto_renew,
    is_cancel,
    transaction_date,
    membership_expire_date                              as expire_date,

    -- A paid period: money changed hands for a real plan length.
    -- Free trials (amount 0) and cancellation rows are not revenue.
    (not is_cancel and amount_paid_ntd > 0 and plan_days > 0)  as is_paid,

    -- Monthly-normalised revenue: KKBox sells 7/30/90/180/360/410-day plans.
    case when not is_cancel and amount_paid_ntd > 0 and plan_days > 0
         then amount_paid_ntd * 30.0 / plan_days end    as monthly_price_ntd,

    case when list_price_ntd > 0
         then greatest(0, 1 - amount_paid_ntd / list_price_ntd) end as discount_pct,

    -- ~0.1% of rows expire before they were bought (or decades out); keep them
    -- visible to tests but out of the coverage logic.
    (expire_date < transaction_date and not is_cancel)
      or expire_date > transaction_date + interval 3 year        as is_date_anomaly
from read_parquet({{ staged('transactions.parquet') }})
