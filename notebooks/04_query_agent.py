# Databricks notebook source
# MAGIC %md
# MAGIC # CareMap AI - 04 Query Agent (v2 — OpenAI embeddings)
# MAGIC
# MAGIC Accepts complex natural-language questions and retrieves relevant facilities using
# MAGIC OpenAI semantic embeddings (`text-embedding-3-small`). Capabilities and geography
# MAGIC are used as soft scoring signals — no candidates are hard-filtered out.

# COMMAND ----------

dbutils.widgets.text("catalog", "workspace", "Unity Catalog catalog")
dbutils.widgets.text("schema", "caremap_ai", "Unity Catalog schema")
dbutils.widgets.text("query", "Chest pain in Bihar, need emergency care with oxygen and ICU support", "Natural language query")
dbutils.widgets.text("openai_api_key", "", "OpenAI API key (leave blank to read from env/secret)")
dbutils.widgets.text("top_k", "10", "Number of results to return")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
query = dbutils.widgets.get("query")
openai_api_key = dbutils.widgets.get("openai_api_key") or None
top_k = int(dbutils.widgets.get("top_k"))
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
from caremap_ai.vector_search import OpenAISemanticRetriever

# COMMAND ----------

import json
import mlflow
import numpy as np

mlflow.set_tracking_uri("databricks")
setup_mlflow("/Shared/caremap-ai-query-traces")

facilities = spark.table(capability_table).toPandas()


def normalize_list_value(value):
    if value is None:
        return []
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else [value]
        except Exception:
            return [value]
    return [str(value)]


if "contradiction_flags" in facilities.columns:
    facilities["contradiction_flags"] = facilities["contradiction_flags"].apply(normalize_list_value)

# COMMAND ----------

# Build the semantic retriever once — embeddings are cached on the object so
# subsequent queries in this session don't re-embed the full dataset.
retriever = OpenAISemanticRetriever(facilities=facilities, api_key=openai_api_key)
agent = QueryAgent(facilities, semantic_retriever=retriever)

with mlflow.start_run(run_name="caremap_query_agent"):
    with trace_span("query_agent", query=query):
        answer = agent.answer(query, top_k=top_k)

display(answer["ranked_facilities"])
print("\n".join(answer["reasoning_steps"]))

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
    # Re-use the same retriever — embedding matrix is already built
    print(QueryAgent(facilities, semantic_retriever=retriever).answer(sample, top_k=3)["ranked_facilities"])
