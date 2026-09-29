{% test dbt_utils_unique_combination(model, columns) %}
select {{ columns | join(', ') }}, count(*) as n
from {{ model }}
group by {{ columns | join(', ') }}
having count(*) > 1
{% endtest %}

{% test positive(model, column_name) %}
select * from {{ model }} where {{ column_name }} <= 0
{% endtest %}

{% test between(model, column_name, low, high) %}
select * from {{ model }}
where {{ column_name }} < {{ low }} or {{ column_name }} > {{ high }}
{% endtest %}

{# Every month: beginning + new + reactivation + expansion - contraction - churn = ending. #}
{% test bridge_reconciles(model) %}
select month
from {{ model }}
where abs(beginning_mrr_ntd + new_mrr_ntd + reactivation_mrr_ntd + expansion_mrr_ntd
          - contraction_mrr_ntd - churned_mrr_ntd - ending_mrr_ntd) > 0.01
{% endtest %}
