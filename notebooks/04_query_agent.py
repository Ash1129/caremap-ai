# Databricks notebook source
# MAGIC %md
# MAGIC # CareMap AI - 04 Query Agent
# MAGIC
# MAGIC Accepts complex natural-language questions, retrieves candidates, filters capabilities,
# MAGIC ranks by trust, and returns evidence.

# COMMAND ----------

dbutils.widgets.text("catalog", "workspace", "Unity Catalog catalog")
dbutils.widgets.text("schema", "caremap_ai", "Unity Catalog schema")
dbutils.widgets.text("query", "Chest pain in Bihar, need emergency care with oxygen and ICU support", "Natural language query")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
query = dbutils.widgets.get("query")
capability_table = f"{catalog}.{schema}.facility_capabilities"

# COMMAND ----------

import sys

notebook_path = dbutils.notebook.entry_point.getDbutils().notebook().getContext().notebookPath().get()
repo_root = "/Workspace/" + "/".join(notebook_path.strip("/").split("/")[:3])
repo_src = f"{repo_root}/src"
if repo_src not in sys.path:
    sys.path.append(repo_src)

from caremap_ai.mlflow_utils import setup_mlflow, trace_span
from caremap_ai.query import QueryAgent

# COMMAND ----------

import mlflow

mlflow.set_tracking_uri("databricks")
setup_mlflow("/Shared/caremap-ai-query-traces")

facilities = spark.table(capability_table).toPandas()
agent = QueryAgent(facilities)

with mlflow.start_run(run_name="caremap_query_agent"):
    with trace_span("query_agent", query=query):
        answer = agent.answer(query, top_k=10)

display(answer["ranked_facilities"])
print(answer["reasoning_steps"])

# COMMAND ----------

sample_queries = [
    "Chest pain in Bihar, need emergency care with oxygen and ICU support",
    "Newborn breathing difficulty near Assam",
    "Emergency surgery in rural Bihar with ICU and oxygen support",
    "Dialysis centers in underserved regions",
    "Trauma care facilities with high trust score",
    "Regions with no ICU access",
]

for sample in sample_queries:
    print("\nQUERY:", sample)
    print(agent.answer(sample, top_k=3)["ranked_facilities"])
