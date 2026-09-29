-- One row per registered member. `bd` (age) is famously dirty in KKBox:
-- 0 for most users and values like -3000 or 1051 for others.
select
    msno,
    city,
    case when age_raw between 10 and 80 then age_raw end as age,
    gender,
    registered_via,
    registration_date
from read_parquet({{ staged('members.parquet') }})
