-- One row per continuous subscription spell (see int_billing_events_sequenced).
select
    msno,
    spell_number,
    min(transaction_date)                              as spell_start,
    -- State after the last event: a cancellation pulls expiry forward.
    arg_max(expire_date, transaction_date)             as spell_end,
    count(*) filter (where is_paid)                    as paid_periods,
    arg_max(is_cancel, transaction_date)               as ended_by_cancel,
    arg_max(is_auto_renew, transaction_date) filter (where is_paid) as last_auto_renew,
    -- Too close to the end of the data to know whether they came back.
    arg_max(expire_date, transaction_date) + interval {{ var('churn_grace_days') }} day
        > date '{{ var("data_end_date") }}'            as is_censored
from {{ ref('int_billing_events_sequenced') }}
group by msno, spell_number
having count(*) filter (where is_paid) > 0   -- ignore stray cancel-only spells
