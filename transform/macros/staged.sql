{# Path to a staged Parquet file/glob written by scripts/ingest.py. #}
{% macro staged(relative) -%}
'{{ var("staged_dir") }}/{{ relative }}'
{%- endmacro %}
