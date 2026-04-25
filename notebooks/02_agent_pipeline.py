# Databricks notebook source
# MAGIC %md
# MAGIC # CareMap AI - 02 Agent Pipeline
# MAGIC
# MAGIC Runs the multi-agent extraction, validation, and trust scoring workflow.
# MAGIC Each phase is logged with MLflow tracing-friendly spans.

# COMMAND ----------

dbutils.widgets.text("catalog", "workspace", "Unity Catalog catalog")
dbutils.widgets.text("schema", "caremap_ai", "Unity Catalog schema")
dbutils.widgets.text("agent_bricks_endpoint", "", "Optional Agent Bricks / Model Serving endpoint")
dbutils.widgets.text("limit", "0", "Optional row limit for demo")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
endpoint_name = dbutils.widgets.get("agent_bricks_endpoint")
limit = int(dbutils.widgets.get("limit"))

clean_table = f"{catalog}.{schema}.clean_facilities"
capability_table = f"{catalog}.{schema}.facility_capabilities"

# COMMAND ----------

import sys

notebook_path = dbutils.notebook.entry_point.getDbutils().notebook().getContext().notebookPath().get()
repo_root = "/Workspace/" + "/".join(notebook_path.strip("/").split("/")[:3])
repo_src = f"{repo_root}/src"
if repo_src not in sys.path:
    sys.path.append(repo_src)

from caremap_ai.extraction import ExtractionAgent, databricks_agent_bricks_extractor
from caremap_ai.mlflow_utils import setup_mlflow, trace_span
from caremap_ai.orchestrator import CareMapAgentPipeline
from caremap_ai.vector_search import build_embedding_text

# COMMAND ----------

import mlflow
import pandas as pd
import json

mlflow.set_tracking_uri("databricks")
setup_mlflow(f"/Shared/caremap-ai-traces")

source_df = spark.table(clean_table)
if limit > 0:
    source_df = source_df.limit(limit)
source_pdf = source_df.toPandas()

llm = databricks_agent_bricks_extractor(endpoint_name) if endpoint_name else None
pipeline = CareMapAgentPipeline(extraction_agent=ExtractionAgent(llm=llm))

# COMMAND ----------

records = []

with mlflow.start_run(run_name="caremap_agent_pipeline"):
    for _, row in source_pdf.iterrows():
        row_dict = row.to_dict()
        with trace_span("facility_agent_pipeline", facility_name=row_dict.get("name")):
            with trace_span("extraction_agent"):
                extracted = pipeline.extraction_agent.extract(row_dict)
            with trace_span("validation_agent"):
                validation = pipeline.validation_agent.validate(extracted)
            with trace_span("trust_scoring_agent"):
                scoring = pipeline.scoring_agent.score(row_dict, extracted, validation)
            merged = {**row_dict, **extracted, **validation, **scoring}
            records.append(merged)

capabilities_pdf = pd.DataFrame(records)
capabilities_pdf["facility_id"] = capabilities_pdf.index.astype(str)
capabilities_pdf["embedding_text"] = capabilities_pdf.apply(build_embedding_text, axis=1)
display(capabilities_pdf[["name", "state", "district_city", "trust_score", "contradiction_flags"]].head(20))

# COMMAND ----------

capabilities_pdf["extracted_evidence"] = capabilities_pdf["extracted_evidence"].apply(json.dumps)
capabilities_sdf = spark.createDataFrame(capabilities_pdf)
(
    capabilities_sdf.write.format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(capability_table)
)

spark.sql(f"ALTER TABLE {capability_table} SET TBLPROPERTIES (delta.enableChangeDataFeed = true)")
display(spark.sql(f"SELECT COUNT(*) AS n_structured_facilities FROM {capability_table}"))

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT
# MAGIC   state,
# MAGIC   COUNT(*) AS facilities,
# MAGIC   AVG(trust_score) AS avg_trust,
# MAGIC   SUM(CASE WHEN size(contradiction_flags) > 0 THEN 1 ELSE 0 END) AS contradiction_count
# MAGIC FROM ${catalog}.${schema}.facility_capabilities
# MAGIC GROUP BY state
# MAGIC ORDER BY avg_trust ASC
