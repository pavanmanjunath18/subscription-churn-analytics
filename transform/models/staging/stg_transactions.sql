-- One row per billing event (payment, renewal, or cancellation).
select
    msno,
    payment_method_id,
    -- ~870K rows record plan length as 0, yet 99% of them are paid (avg
    -- NT$159) and expire ~31 days out: ordinary monthly payments with the
    -- field missing. Infer the length from the expiry date instead.
    case when payment_plan_days > 0 then payment_plan_days
         when not is_cancel and membership_expire_date > transaction_date
         then date_diff('day', transaction_date, membership_expire_date)
    end                                                 as plan_days,
    (payment_plan_days = 0 and not is_cancel)           as is_plan_days_inferred,
    plan_list_price                                     as list_price_ntd,
    actual_amount_paid                                  as amount_paid_ntd,
    is_auto_renew,
    is_cancel,
    transaction_date,
    membership_expire_date                              as expire_date,

    -- A paid period: money changed hands for a real plan length.
    -- Free trials (amount 0) and cancellation rows are not revenue.
    (not is_cancel and amount_paid_ntd > 0 and plan_days > 0)  as is_paid,

    -- Any non-cancel period keeps a membership alive, including NT$0 promo
    -- periods. Matches Kaggle's labeller (WSDMChurnLabeller.scala): any
    -- non-cancel transaction within 30 days counts as a renewal.
    (not is_cancel and plan_days > 0)                           as is_coverage,

    -- Monthly-normalised revenue: KKBox sells 7/30/90/180/360/410-day plans.
    case when not is_cancel and amount_paid_ntd > 0 and plan_days > 0
         then amount_paid_ntd * 30.0 / plan_days end    as monthly_price_ntd,

    case when list_price_ntd > 0
         then greatest(0, 1 - amount_paid_ntd / list_price_ntd) end as discount_pct,

    -- ~0.03% of rows expire before they were bought (or decades out); keep them
    -- visible to tests but out of the coverage logic.
    (expire_date < transaction_date and not is_cancel)
      or expire_date > transaction_date + interval 3 year        as is_date_anomaly
from read_parquet({{ staged('transactions.parquet') }})
