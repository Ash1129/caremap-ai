# Databricks notebook source
# MAGIC %md
# MAGIC # CareMap AI - 00 Setup and Ingest
# MAGIC
# MAGIC Loads the exact healthcare facility schema from Excel/CSV into Unity Catalog Delta tables.
# MAGIC Designed for Databricks Free Edition first, with conservative fallbacks for small hackathon files.

# COMMAND ----------

dbutils.widgets.text("catalog", "workspace", "Unity Catalog catalog")
dbutils.widgets.text("schema", "caremap_ai", "Unity Catalog schema")
dbutils.widgets.text(
    "source_path",
    "/Workspace/Repos/ap2538@cornell.edu/caremap-ai/data/VF_Hackathon_Dataset_India_Large.xlsx",
    "Excel or CSV source path",
)
dbutils.widgets.text("source_format", "excel", "excel or csv")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
source_path = dbutils.widgets.get("source_path")
source_format = dbutils.widgets.get("source_format").lower()

raw_table = f"{catalog}.{schema}.raw_facilities"

# COMMAND ----------

spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")
spark.sql(f"USE CATALOG {catalog}")
spark.sql(f"USE SCHEMA {schema}")

# COMMAND ----------

import sys

repo_src = "/Workspace/Repos/caremap-ai/src"
if repo_src not in sys.path:
    sys.path.append(repo_src)

try:
    from caremap_ai.schema import SOURCE_COLUMNS
except Exception:
    # If this notebook is imported directly, paste/upload the src folder into the same Repo.
    raise

# COMMAND ----------

import pandas as pd

if source_format == "excel":
    pdf = pd.read_excel(source_path)
elif source_format == "csv":
    pdf = pd.read_csv(source_path)
else:
    raise ValueError("source_format must be 'excel' or 'csv'")

missing = [col for col in SOURCE_COLUMNS if col not in pdf.columns]
if missing:
    raise ValueError(f"Dataset is missing required columns: {missing}")

pdf = pdf[SOURCE_COLUMNS]
display(pdf.head(10))

# COMMAND ----------

df = spark.createDataFrame(pdf)
(
    df.write.format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(raw_table)
)

spark.sql(f"ALTER TABLE {raw_table} SET TBLPROPERTIES (delta.enableChangeDataFeed = true)")
display(spark.sql(f"SELECT COUNT(*) AS n_facilities FROM {raw_table}"))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Genie Code Setup Prompt
# MAGIC
# MAGIC Use this inside Genie Code Agent mode after import:
# MAGIC
# MAGIC > Inspect `workspace.caremap_ai.raw_facilities`, verify schema quality, and help run the CareMap AI notebooks in order: ingest, agent pipeline, vector search, query agent, and desert dashboard.
