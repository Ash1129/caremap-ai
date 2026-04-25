# Databricks notebook source
# MAGIC %md
# MAGIC # CareMap AI - 05 Medical Desert Detection
# MAGIC
# MAGIC Produces SQL-ready tables for dashboards and Genie spaces.

# COMMAND ----------

dbutils.widgets.text("catalog", "workspace", "Unity Catalog catalog")
dbutils.widgets.text("schema", "caremap_ai", "Unity Catalog schema")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")

capability_table = f"{catalog}.{schema}.facility_capabilities"
desert_table = f"{catalog}.{schema}.medical_deserts"

# COMMAND ----------

import sys

notebook_path = dbutils.notebook.entry_point.getDbutils().notebook().getContext().notebookPath().get()
repo_root = "/Workspace/" + "/".join(notebook_path.strip("/").split("/")[:3])
repo_src = f"{repo_root}/src"
if repo_src not in sys.path:
    sys.path.append(repo_src)

from caremap_ai.desert import DesertDetectionAgent

facilities = spark.table(capability_table).toPandas()
deserts = DesertDetectionAgent().detect(facilities)
display(deserts.head(50))

(
    spark.createDataFrame(deserts)
    .write.format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(desert_table)
)

# COMMAND ----------

# MAGIC %sql
# MAGIC -- Dashboard tile: highest-risk regions
# MAGIC SELECT state, district_city, pin_code, facility_count, trusted_facility_count, missing_services
# MAGIC FROM ${catalog}.${schema}.medical_deserts
# MAGIC WHERE risk_level = 'high'
# MAGIC ORDER BY trusted_facility_count ASC, facility_count ASC
# MAGIC LIMIT 100

# COMMAND ----------

# MAGIC %sql
# MAGIC -- Dashboard tile: service availability by state
# MAGIC SELECT
# MAGIC   state,
# MAGIC   COUNT(*) AS total_facilities,
# MAGIC   SUM(CASE WHEN trust_score > 70 THEN 1 ELSE 0 END) AS high_trust_facilities,
# MAGIC   SUM(CASE WHEN has_icu = true AND trust_score > 70 THEN 1 ELSE 0 END) AS trusted_icu,
# MAGIC   SUM(CASE WHEN has_dialysis = true AND trust_score > 70 THEN 1 ELSE 0 END) AS trusted_dialysis,
# MAGIC   SUM(CASE WHEN has_oncology = true AND trust_score > 70 THEN 1 ELSE 0 END) AS trusted_oncology,
# MAGIC   SUM(CASE WHEN has_trauma_care = true AND trust_score > 70 THEN 1 ELSE 0 END) AS trusted_trauma,
# MAGIC   SUM(CASE WHEN has_neonatal_care = true AND trust_score > 70 THEN 1 ELSE 0 END) AS trusted_neonatal
# MAGIC FROM ${catalog}.${schema}.facility_capabilities
# MAGIC GROUP BY state
# MAGIC ORDER BY high_trust_facilities ASC
