-- One row per member per month of listening activity. The raw log is daily and
-- split across two files (v1 to Feb 2017, v2 = Mar 2017), so re-aggregate.
select
    msno,
    month,
    sum(days_active)          as days_active,
    sum(songs_played)         as songs_played,
    sum(songs_completed)      as songs_completed,
    sum(songs_skipped_early)  as songs_skipped_early,
    sum(unique_songs)         as unique_songs,
    sum(hours_listened)       as hours_listened
from read_parquet({{ staged('user_logs_monthly/*.parquet') }})
group by 1, 2
