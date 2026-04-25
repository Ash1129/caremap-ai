# Databricks notebook source
# MAGIC %md
# MAGIC # CareMap AI - 01 Clean and Profile Data
# MAGIC
# MAGIC Standardizes the raw Excel-derived table into a clean Delta table that agents can consume safely.
# MAGIC
# MAGIC Important: this notebook cleans **types and missing values only**. It does not trust or verify
# MAGIC clinical claims. Claim validation happens later in the Validation Agent.

# COMMAND ----------

dbutils.widgets.text("catalog", "workspace", "Unity Catalog catalog")
dbutils.widgets.text("schema", "caremap_ai", "Unity Catalog schema")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")

raw_table = f"{catalog}.{schema}.raw_facilities"
clean_table = f"{catalog}.{schema}.clean_facilities"
profile_table = f"{catalog}.{schema}.data_quality_profile"

# COMMAND ----------

import sys

notebook_path = dbutils.notebook.entry_point.getDbutils().notebook().getContext().notebookPath().get()
repo_root = "/Workspace/" + "/".join(notebook_path.strip("/").split("/")[:3])
repo_src = f"{repo_root}/src"
if repo_src not in sys.path:
    sys.path.append(repo_src)

from caremap_ai.schema import SOURCE_COLUMNS, TEXT_COLUMNS

# COMMAND ----------

from pyspark.sql import functions as F

raw_df = spark.table(raw_table)

missing_columns = [col for col in SOURCE_COLUMNS if col not in raw_df.columns]
if missing_columns:
    raise ValueError(f"Raw table is missing required columns: {missing_columns}")

df = raw_df.select(*SOURCE_COLUMNS)

string_columns = [
    col
    for col in SOURCE_COLUMNS
    if col not in {
        "yearEstablished",
        "numberDoctors",
        "capacity",
        "recency_of_page_update",
        "distinct_social_media_presence_count",
        "number_of_facts_about_the_organization",
        "post_metrics_post_count",
        "engagement_metrics_n_followers",
        "engagement_metrics_n_likes",
        "engagement_metrics_n_engagements",
        "latitude",
        "longitude",
    }
]

numeric_columns = [col for col in SOURCE_COLUMNS if col not in string_columns]

for col in string_columns:
    df = df.withColumn(
        col,
        F.trim(
            F.regexp_replace(
                F.coalesce(F.col(col).cast("string"), F.lit("")),
                r"\s+",
                " ",
            )
        ),
    )

for col in numeric_columns:
    df = df.withColumn(
        col,
        F.regexp_replace(F.col(col).cast("string"), ",", "").cast("double"),
    )

df = df.withColumn(
    "full_address",
    F.concat_ws(
        ", ",
        F.col("address_line1"),
        F.col("address_line2"),
        F.col("address_line3"),
        F.col("address_city"),
        F.col("address_stateOrRegion"),
        F.col("address_zipOrPostcode"),
    ),
)

df = df.withColumn(
    "combined_healthcare_text",
    F.concat_ws(" | ", *[F.col(col) for col in TEXT_COLUMNS]),
)

df = df.withColumn("has_coordinates", F.col("latitude").isNotNull() & F.col("longitude").isNotNull())
df = df.withColumn("has_any_capability_text", F.length(F.col("combined_healthcare_text")) > 0)

display(df.limit(20))

# COMMAND ----------

(
    df.write.format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(clean_table)
)

spark.sql(f"ALTER TABLE {clean_table} SET TBLPROPERTIES (delta.enableChangeDataFeed = true)")
display(spark.sql(f"SELECT COUNT(*) AS n_clean_facilities FROM {clean_table}"))

# COMMAND ----------

total_rows = df.count()

profile_rows = []
for col in SOURCE_COLUMNS:
    null_count = df.filter(F.col(col).isNull() | (F.trim(F.col(col).cast("string")) == "")).count()
    profile_rows.append(
        {
            "column_name": col,
            "total_rows": total_rows,
            "missing_or_blank_count": null_count,
            "missing_or_blank_pct": round((null_count / total_rows) * 100, 2) if total_rows else 0.0,
        }
    )

profile_df = spark.createDataFrame(profile_rows)
(
    profile_df.write.format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(profile_table)
)

display(profile_df.orderBy(F.desc("missing_or_blank_pct")))

# COMMAND ----------

# MAGIC %sql
# MAGIC -- Quick quality checks for the demo narrative.
# MAGIC SELECT
# MAGIC   COUNT(*) AS facilities,
# MAGIC   SUM(CASE WHEN has_any_capability_text THEN 1 ELSE 0 END) AS rows_with_capability_text,
# MAGIC   SUM(CASE WHEN has_coordinates THEN 1 ELSE 0 END) AS rows_with_coordinates,
# MAGIC   SUM(CASE WHEN address_stateOrRegion = '' THEN 1 ELSE 0 END) AS missing_state,
# MAGIC   SUM(CASE WHEN address_city = '' THEN 1 ELSE 0 END) AS missing_city
# MAGIC FROM ${catalog}.${schema}.clean_facilities
