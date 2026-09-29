-- Month-end snapshots: a member is a paying subscriber at month end if a
-- subscription spell covers that date and their most recent membership period
-- (as-of join) was paid. Members in a free promo period are covered but not
-- paying, so they carry no MRR.
with spine as (
    select month::date as month, last_day(month)::date as month_end
    from range(date '{{ var("first_month") }}', date '{{ var("last_complete_month") }}' + interval 1 month,
               interval 1 month) t(month)
),
covered as (
    select s.msno, sp.month, sp.month_end, s.spell_number
    from {{ ref('int_subscription_spells') }} s
    join spine sp
      on s.spell_start <= sp.month_end
     and s.spell_end   >= sp.month_end
),
periods as (
    select * from {{ ref('int_billing_events') }} where is_coverage
)
select
    c.msno,
    c.month,
    c.spell_number,
    p.monthly_price_ntd   as mrr_ntd,
    p.plan_days,
    p.is_auto_renew,
    p.payment_method_id,
    p.discount_pct
from covered c
asof join periods p
  on c.msno = p.msno
 and c.month_end >= p.transaction_date
where p.monthly_price_ntd > 0
